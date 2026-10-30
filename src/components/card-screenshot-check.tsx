"use client";

import { useEffect, useState, useTransition } from "react";
import { CircleCheck, ImageUp, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { homeCard } from "@/components/home-card";
import { SectionLabel } from "@/components/page-header";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  addShotPurchase,
  analyzeCardScreenshots,
  ignoreShotLine,
  keepAppPurchase,
  linkShot,
  reconcileSavedShots,
  type ShotAnalysis,
} from "@/lib/actions/card-screenshots";
import { deleteCardPurchase } from "@/lib/actions/card";
import { unwrap } from "@/lib/action-result";
import { errorMessage } from "@/lib/error-message";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

type BankLine = ShotAnalysis["onlyBank"][number];
type AppLine = ShotAnalysis["onlyApp"][number];

/** O maior lado que a API aproveita: acima disso ela reduz de qualquer jeito. */
const MAX_SIDE = 1568;

/** Reduz a print para JPEG: várias prints de celular passariam dos 4MB da server action. */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("imagem"))), "image/jpeg", 0.85),
  );
}

/**
 * A última leitura de cada cartão fica no aparelho: sair e voltar à tela
 * concilia de novo sem mandar as prints (nem pagar a IA) outra vez.
 */
type Saved = { readAt: string; skipped: number; lines: ShotAnalysis["lines"] };
const storageKey = (cardId: string) => `card-shots:${cardId}`;

function loadSaved(cardId: string): Saved | null {
  try {
    const raw = localStorage.getItem(storageKey(cardId));
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

function storeSaved(cardId: string, saved: Saved | null) {
  try {
    if (saved) localStorage.setItem(storageKey(cardId), JSON.stringify(saved));
    else localStorage.removeItem(storageKey(cardId));
  } catch {
    // Sem armazenamento (aba anônima): a conferência vale só enquanto a tela está aberta.
  }
}

/** "2026-10-07" → "07 out" — lido como dia de calendário, sem fuso. */
function shortDay(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" })
    .format(new Date(`${iso}T00:00:00.000Z`))
    .replace(".", "");
}

/**
 * Conferir o cartão pelas prints da tela de lançamentos do app do banco, com
 * a fatura aberta: o que está só no banco, o que está só no app, e ligar um ao
 * outro quando o valor difere (o app fica com o valor do banco).
 */
export function CardScreenshotCheck({ cardId }: { cardId: string }) {
  const [analysis, setAnalysis] = useState<ShotAnalysis | null>(null);
  const [readAt, setReadAt] = useState<string | null>(null);
  const [linking, setLinking] = useState<AppLine | null>(null);
  const [deleting, setDeleting] = useState<AppLine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, startReading] = useTransition();
  const [saving, startSaving] = useTransition();

  // Voltando à tela: a leitura guardada, conciliada com o app de agora.
  useEffect(() => {
    const saved = loadSaved(cardId);
    if (!saved) return;
    startReading(async () => {
      try {
        setAnalysis(unwrap(await reconcileSavedShots(cardId, saved)));
        setReadAt(saved.readAt);
      } catch {
        storeSaved(cardId, null);
      }
    });
  }, [cardId]);

  function discard() {
    storeSaved(cardId, null);
    setAnalysis(null);
    setReadAt(null);
    setLinking(null);
  }

  function read(files: File[]) {
    setError(null);
    setLinking(null);
    startReading(async () => {
      try {
        const data = new FormData();
        for (const file of files) data.append("images", await shrink(file), "print.jpg");
        const result = unwrap(await analyzeCardScreenshots(cardId, data));
        const now = new Date().toISOString();
        storeSaved(cardId, { readAt: now, skipped: result.skipped, lines: result.lines });
        setAnalysis(result);
        setReadAt(now);
      } catch (e) {
        setError(errorMessage(e, "Não deu para ler as prints. Tente de novo."));
      }
    });
  }

  /** Roda a action e, dando certo, atualiza a conciliação na tela. */
  function act(run: () => Promise<unknown>, update: (a: ShotAnalysis) => ShotAnalysis) {
    setError(null);
    startSaving(async () => {
      try {
        unwrap(await run());
        setAnalysis((current) => current && update(current));
      } catch (e) {
        setError(errorMessage(e, "Não deu para salvar. Tente de novo."));
      }
    });
  }

  const dropBank = (a: ShotAnalysis, line: BankLine) => ({
    ...a,
    onlyBank: a.onlyBank.filter((l) => l.fingerprint !== line.fingerprint),
  });
  const dropApp = (a: ShotAnalysis, purchase: AppLine) => ({
    ...a,
    onlyApp: a.onlyApp.filter((p) => p.id !== purchase.id),
  });
  const round2 = (n: number) => Math.round(n * 100) / 100;

  function add(line: BankLine) {
    act(
      () => addShotPurchase(cardId, line),
      (a) => ({ ...dropBank(a, line), appTotal: round2(a.appTotal + line.amount), matched: a.matched + 1 }),
    );
  }
  function ignore(line: BankLine) {
    act(() => ignoreShotLine(line.fingerprint), (a) => dropBank(a, line));
  }
  function keep(purchase: AppLine) {
    act(() => keepAppPurchase(purchase.id), (a) => dropApp(a, purchase));
  }
  function link(purchase: AppLine, line: BankLine) {
    setLinking(null);
    act(
      () => linkShot(cardId, purchase.id, line.amount),
      (a) => ({
        ...dropBank(dropApp(a, purchase), line),
        // Ligada, a compra passa a contar pelo valor do banco.
        appTotal: round2(a.appTotal - purchase.amount + line.amount),
        matched: a.matched + 1,
      }),
    );
  }
  function remove(purchase: AppLine) {
    startSaving(async () => {
      try {
        await deleteCardPurchase(purchase.id, cardId);
        setDeleting(null);
        setAnalysis(
          (a) => a && { ...dropApp(a, purchase), appTotal: round2(a.appTotal - purchase.amount) },
        );
      } catch (e) {
        setDeleting(null);
        setError(errorMessage(e, "Não deu para excluir. Tente de novo."));
      }
    });
  }

  const gap = analysis ? round2(analysis.bankTotal - analysis.appTotal) : 0;
  const done = analysis && analysis.onlyBank.length === 0 && analysis.onlyApp.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>Conferir com o banco</SectionLabel>
      <label
        className={homeCard(
          cn(
            "flex cursor-pointer flex-col items-center gap-2 border border-dashed border-(--hairline-strong) text-center transition-colors duration-150 hover:bg-card-hover",
            reading && "pointer-events-none opacity-70",
          ),
        )}
      >
        <ImageUp className="size-6 text-primary" aria-hidden="true" />
        <span className="font-heading text-[15px] font-semibold">
          {reading ? "Conferindo..." : analysis ? "Conferir outras prints" : "Escolher prints"}
        </span>
        <span className="text-[13px] text-muted-foreground">
          Prints da tela de lançamentos do app do banco. Pode mandar várias, mesmo repetindo
          lançamentos de uma para outra.
        </span>
        <input
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          disabled={reading}
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            if (files.length > 0) read(files);
            e.target.value = "";
          }}
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}

      {analysis && (
        <>
          <div className={homeCard("flex flex-col gap-3")}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-heading text-[15px] font-semibold">
                  De {shortDay(analysis.period.start)} a {shortDay(analysis.period.end)}
                </p>
                {readAt && (
                  <p className="text-[12.5px] text-muted-foreground">
                    Prints lidas em{" "}
                    {new Intl.DateTimeFormat("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(readAt))}
                  </p>
                )}
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={discard}>
                Encerrar conferência
              </Button>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-[12.5px] text-muted-foreground">Nas prints</dt>
                <dd className="font-heading text-lg font-bold tabular-nums">
                  {formatCurrency(analysis.bankTotal)}
                </dd>
              </div>
              <div>
                <dt className="text-[12.5px] text-muted-foreground">No app</dt>
                <dd className="font-heading text-lg font-bold tabular-nums">
                  {formatCurrency(analysis.appTotal)}
                </dd>
              </div>
            </dl>
            <p className="text-[13px] text-muted-foreground">
              {analysis.matched} {analysis.matched === 1 ? "confere" : "conferem"}
              {analysis.skipped > 0
                ? ` · ${analysis.skipped} negadas, canceladas ou que não são compra ficaram de fora`
                : ""}
              {analysis.resolvedBefore > 0 ? ` · ${analysis.resolvedBefore} resolvidas antes` : ""}
              {Math.abs(gap) >= 0.01
                ? ` · ${formatCurrency(Math.abs(gap))} a mais ${gap > 0 ? "no banco" : "no app"}`
                : " · os totais batem"}
              .
            </p>
          </div>

          {done && (
            <div className={homeCard("flex items-center gap-3")}>
              <CircleCheck className="size-6 shrink-0 text-positive" aria-hidden="true" />
              <p className="text-sm">Nenhuma diferença entre as prints e o app.</p>
            </div>
          )}

          {linking && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[18px] bg-primary/8 px-4 py-3 text-[13px] ring-1 ring-primary/20">
              <p>
                Qual linha do banco é <b>{linking.description}</b> (
                {formatCurrency(linking.amount)})?
              </p>
              <Button type="button" variant="ghost" size="sm" onClick={() => setLinking(null)}>
                Cancelar
              </Button>
            </div>
          )}

          {analysis.onlyBank.length > 0 && (
            <div className="flex flex-col gap-2">
              <SectionLabel>Só no banco ({analysis.onlyBank.length})</SectionLabel>
              <ul className="flex flex-col gap-2">
                {analysis.onlyBank.map((line) => (
                  <Row
                    key={line.fingerprint}
                    title={line.description}
                    sub={`${shortDay(line.date)} · ${line.time}`}
                    amount={line.amount}
                  >
                    {linking ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={saving}
                        onClick={() => link(linking, line)}
                      >
                        <Link2 aria-hidden="true" />
                        É esta
                        {/* Parcelada: a linha é a parcela (linkedAmount, no servidor). */}
                        {linking.installments > 1 &&
                          ` (${formatCurrency(round2(line.amount * linking.installments))} em ${linking.installments}x)`}
                      </Button>
                    ) : (
                      <>
                        <Button type="button" size="sm" disabled={saving} onClick={() => add(line)}>
                          Adicionar
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={saving}
                          onClick={() => ignore(line)}
                        >
                          Ignorar
                        </Button>
                      </>
                    )}
                  </Row>
                ))}
              </ul>
            </div>
          )}

          {analysis.onlyApp.length > 0 && (
            <div className="flex flex-col gap-2">
              <SectionLabel>Só no app ({analysis.onlyApp.length})</SectionLabel>
              <ul className="flex flex-col gap-2">
                {analysis.onlyApp.map((purchase) => (
                  <Row
                    key={purchase.id}
                    title={purchase.description}
                    sub={
                      shortDay(purchase.date) +
                      (purchase.installments > 1 ? ` · ${purchase.installments}x` : "")
                    }
                    amount={purchase.amount}
                    dimmed={linking !== null && linking.id !== purchase.id}
                  >
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={saving || analysis.onlyBank.length === 0}
                      aria-pressed={linking?.id === purchase.id}
                      onClick={() => setLinking(linking?.id === purchase.id ? null : purchase)}
                    >
                      Ligar
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={saving}
                      onClick={() => keep(purchase)}
                    >
                      Manter
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={saving}
                      onClick={() => setDeleting(purchase)}
                    >
                      Excluir
                    </Button>
                  </Row>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Ligar corrige o valor do app para o do banco. Manter deixa como está e não pergunta
                de novo.
              </p>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Excluir compra?"
        description={
          deleting
            ? `${deleting.description} (${formatCurrency(deleting.amount)}) sai do cartão e das faturas. Não dá para desfazer.`
            : undefined
        }
        confirmLabel="Excluir"
        destructive
        isPending={saving}
        onConfirm={() => deleting && remove(deleting)}
      />
    </div>
  );
}

function Row({
  title,
  sub,
  amount,
  dimmed,
  children,
}: {
  title: string;
  sub: string;
  amount: number;
  dimmed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li
      className={homeCard(
        cn(
          "flex flex-wrap items-center gap-x-3 gap-y-2 py-3 pr-3 pl-4 transition-opacity lg:py-3 lg:pr-3 lg:pl-4",
          dimmed && "opacity-55",
        ),
      )}
    >
      <div className="min-w-[10rem] flex-1">
        <p className="truncate text-[15px] font-semibold">{title}</p>
        <p className="text-[13px] text-muted-foreground">{sub}</p>
      </div>
      <span className="shrink-0 text-[15px] font-semibold tabular-nums">
        {formatCurrency(amount)}
      </span>
      <div className="flex gap-1">{children}</div>
    </li>
  );
}
