"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, CircleCheck, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { homeCard } from "@/components/home-card";
import { SectionLabel } from "@/components/page-header";
import {
  analyzeStatement,
  applyStatementDecisions,
  type StatementAnalysis,
} from "@/lib/actions/statement";
import { errorMessage } from "@/lib/error-message";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

type Decision = "add" | "ignore";
type Ready = Extract<StatementAnalysis, { ok: true }>;
type AccountReady = Extract<Ready, { mode: "account" }>;
type CardReady = Extract<Ready, { mode: "card" }>;

/** Uma linha da lista, igual para extrato e fatura. */
interface Row {
  fingerprint: string;
  title: string;
  sub: string;
  amount: string;
  positive: boolean;
}

function rowsOf(analysis: Ready, categoryName: Map<string, string>): Row[] {
  const category = (id: string | null) =>
    id && categoryName.get(id) ? ` · ${categoryName.get(id)}` : "";
  if (analysis.mode === "card") {
    return analysis.differences.map((d) => ({
      fingerprint: d.fingerprint,
      title: d.description,
      sub:
        `${shortDay(d.date)}` +
        (d.installment
          ? ` · parcela ${d.installment.current}/${d.installment.total} · entra ${d.purchase.installments}x`
          : d.fee
            ? " · tarifa do banco"
            : "") +
        category(d.categoryId),
      amount: formatCurrency(d.amount),
      positive: false,
    }));
  }
  return analysis.differences.map((d) => ({
    fingerprint: d.fingerprint,
    title: d.description,
    sub: `${shortDay(d.date)} · ${d.direction === "in" ? "entrada" : "saída"}${category(d.categoryId)}`,
    amount: d.direction === "in" ? `+${formatCurrency(d.amount)}` : formatCurrency(d.amount),
    positive: d.direction === "in",
  }));
}

/** "2026-10-07" → "07 out" — lido como dia de calendário, sem fuso. */
function shortDay(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" })
    .format(new Date(`${iso}T00:00:00.000Z`))
    .replace(".", "");
}

/**
 * Importar extrato (Nubank, Sicoob) ou fatura do cartão (Sicoob): escolher o
 * PDF, ver o que não está no app e decidir linha a linha. Nada é gravado
 * antes de "Confirmar".
 */
export function StatementImport({ categories }: { categories: { id: string; name: string }[] }) {
  const [analysis, setAnalysis] = useState<Ready | null>(null);
  // Guardado para conferir de novo contra outro cartão, sem escolher o arquivo de novo.
  const [file, setFile] = useState<File | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [done, setDone] = useState<{ added: number; ignored: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, startReading] = useTransition();
  const [saving, startSaving] = useTransition();
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  function read(chosen: File, cardId?: string) {
    setError(null);
    setDone(null);
    setFile(chosen);
    const data = new FormData();
    data.set("file", chosen);
    if (cardId) data.set("cardId", cardId);
    startReading(async () => {
      try {
        const result = await analyzeStatement(data);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setAnalysis(result);
        setDecisions({});
      } catch (e) {
        setError(errorMessage(e, "Não deu para ler o extrato. Tente de novo."));
      }
    });
  }

  function decideAll(decision: Decision) {
    if (!analysis) return;
    setDecisions(Object.fromEntries(analysis.differences.map((d) => [d.fingerprint, decision])));
  }

  function confirm() {
    if (!analysis) return;
    const chosen = (decision: Decision) => (d: { fingerprint: string }) =>
      decisions[d.fingerprint] === decision;
    const ignore = analysis.differences.filter(chosen("ignore")).map((d) => d.fingerprint);
    const payload =
      analysis.mode === "card"
        ? {
            add: [],
            ignore,
            cardAdd: analysis.differences.filter(chosen("add")).map((d) => ({
              cardId: analysis.cardId,
              ...d.purchase,
              categoryId: d.categoryId,
            })),
          }
        : { add: analysis.differences.filter(chosen("add")), ignore };
    setError(null);
    startSaving(async () => {
      try {
        const result = await applyStatementDecisions(payload);
        setDone(result);
        setAnalysis(null);
        setDecisions({});
      } catch (e) {
        setError(errorMessage(e, "Não deu para salvar. Tente de novo."));
      }
    });
  }

  const decided = Object.keys(decisions).length;
  const toAdd = Object.values(decisions).filter((d) => d === "add").length;

  return (
    <div className="flex flex-col gap-5">
      <label
        className={homeCard(
          cn(
            "flex cursor-pointer flex-col items-center gap-2 border border-dashed border-(--hairline-strong) text-center transition-colors duration-150 hover:bg-card-hover",
            reading && "pointer-events-none opacity-70",
          ),
        )}
      >
        <FileUp className="size-6 text-primary" aria-hidden="true" />
        <span className="font-heading text-[15px] font-semibold">
          {reading
            ? "Lendo o extrato..."
            : analysis
              ? "Escolher outro extrato"
              : "Escolher o PDF do extrato"}
        </span>
        <span className="text-[13px] text-muted-foreground">
          O PDF do extrato da conta (Nubank ou Sicoob) ou da fatura do cartão Sicoob, como o app do
          banco exporta.
        </span>
        <input
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          disabled={reading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) read(file);
            e.target.value = "";
          }}
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}

      {done && (
        <div className={homeCard("flex items-center gap-3")}>
          <CircleCheck className="size-6 shrink-0 text-positive" aria-hidden="true" />
          <p className="text-sm">
            {done.added > 0 &&
              `${done.added} ${done.added === 1 ? "lançamento adicionado" : "lançamentos adicionados"}. `}
            {done.ignored > 0 &&
              `${done.ignored} ${done.ignored === 1 ? "linha ignorada" : "linhas ignoradas"}. `}
            {done.added === 0 && done.ignored === 0 && "Nada mudou. "}
            <Link
              href="/historico"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Ver no Histórico
            </Link>
          </p>
        </div>
      )}

      {analysis && (
        <>
          {analysis.mode === "card" ? (
            <CardSummary
              analysis={analysis}
              disabled={reading}
              onCardChange={(cardId) => file && read(file, cardId)}
            />
          ) : (
            <Summary analysis={analysis} />
          )}

          {analysis.mode === "account" &&
            analysis.unmatchedBills.map((bill) => (
              <div
                key={`${bill.date}-${bill.amount}`}
                className="flex items-start gap-3 rounded-[18px] bg-negative/8 px-4 py-3 text-[13px] ring-1 ring-negative/20"
              >
                <AlertTriangle
                  className="mt-0.5 size-4 shrink-0 text-negative"
                  aria-hidden="true"
                />
                <p>
                  Pagamento de fatura de{" "}
                  <b className="tabular-nums">{formatCurrency(bill.amount)}</b> em{" "}
                  {shortDay(bill.date)} não está marcado no app. Confira em{" "}
                  <Link href="/cartoes" className="font-medium underline underline-offset-4">
                    Cartões
                  </Link>
                  .
                </p>
              </div>
            ))}

          {analysis.differences.length === 0 ? (
            <div className={homeCard("flex items-center gap-3")}>
              <CircleCheck className="size-6 shrink-0 text-positive" aria-hidden="true" />
              <p className="text-sm">
                Tudo {analysis.mode === "card" ? "da fatura" : "do extrato"} já está no app. Nenhuma
                diferença.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SectionLabel>
                  {analysis.differences.length === 1
                    ? `1 ${analysis.mode === "card" ? "lançamento" : "movimentação"} que não está no app`
                    : `${analysis.differences.length} ${analysis.mode === "card" ? "lançamentos" : "movimentações"} que não estão no app`}
                </SectionLabel>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => decideAll("add")}>
                    Adicionar todas
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => decideAll("ignore")}
                  >
                    Ignorar todas
                  </Button>
                </div>
              </div>
              <ul className="flex flex-col gap-2">
                {rowsOf(analysis, categoryName).map((d) => (
                  <DifferenceRow
                    key={d.fingerprint}
                    row={d}
                    decision={decisions[d.fingerprint]}
                    onDecide={(decision) =>
                      setDecisions((current) => ({ ...current, [d.fingerprint]: decision }))
                    }
                  />
                ))}
              </ul>
              <div className="flex flex-col gap-1.5">
                <Button type="button" onClick={confirm} disabled={saving || decided === 0}>
                  {saving
                    ? "Salvando..."
                    : decided === 0
                      ? "Escolha adicionar ou ignorar"
                      : `Confirmar (${toAdd} para adicionar, ${decided - toAdd} para ignorar)`}
                </Button>
                {decided > 0 && decided < analysis.differences.length && (
                  <p className="text-center text-xs text-muted-foreground">
                    As que ficarem sem escolha voltam a aparecer na próxima importação.
                  </p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CardSummary({
  analysis,
  disabled,
  onCardChange,
}: {
  analysis: CardReady;
  disabled: boolean;
  onCardChange: (cardId: string) => void;
}) {
  const gap =
    analysis.bankTotal !== null
      ? Math.round((analysis.bankTotal - analysis.appTotal) * 100) / 100
      : null;
  return (
    <div className={homeCard("flex flex-col gap-3")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-heading text-[15px] font-semibold">
          Fatura{analysis.dueDate ? ` que vence em ${shortDay(analysis.dueDate)}` : ""}
        </p>
        {analysis.cards.length > 1 && (
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            Cartão no app
            <select
              value={analysis.cardId}
              disabled={disabled}
              onChange={(e) => onCardChange(e.target.value)}
              className="rounded-full bg-(--field) px-3 py-1.5 text-[13px] font-medium text-foreground ring-1 ring-(--hairline)"
            >
              {analysis.cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-[12.5px] text-muted-foreground">No banco</dt>
          <dd className="font-heading text-lg font-bold tabular-nums">
            {analysis.bankTotal !== null ? formatCurrency(analysis.bankTotal) : "—"}
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
        {analysis.lineCount} lançamentos · {analysis.matched}{" "}
        {analysis.matched === 1 ? "já estava" : "já estavam"} no app
        {analysis.alreadyIgnored > 0 ? ` · ${analysis.alreadyIgnored} ignorados antes` : ""}
        {gap !== null && Math.abs(gap) >= 0.01
          ? ` · faltam ${formatCurrency(Math.abs(gap))} ${gap > 0 ? "no app" : "no banco"}`
          : gap !== null
            ? " · os totais batem"
            : ""}
        .
      </p>
    </div>
  );
}

function Summary({ analysis }: { analysis: AccountReady }) {
  const parts = [
    `${analysis.matched} já ${analysis.matched === 1 ? "estava" : "estavam"} no app`,
    analysis.ownTransfers > 0 && `${analysis.ownTransfers} entre suas contas`,
    analysis.investments > 0 && `${analysis.investments} de investimento`,
    analysis.alreadyIgnored > 0 &&
      `${analysis.alreadyIgnored} ${analysis.alreadyIgnored === 1 ? "ignorada" : "ignoradas"} antes`,
  ].filter(Boolean);
  return (
    <p className="text-[13px] text-muted-foreground">
      {analysis.period
        ? `Extrato de ${shortDay(analysis.period.start)} a ${shortDay(analysis.period.end)}: `
        : "Extrato: "}
      {analysis.total} movimentações · {parts.join(" · ")}.
    </p>
  );
}

function DifferenceRow({
  row,
  decision,
  onDecide,
}: {
  row: Row;
  decision?: Decision;
  onDecide: (decision: Decision) => void;
}) {
  return (
    <li
      className={homeCard(
        cn(
          "flex flex-wrap items-center gap-x-3 gap-y-2 py-3 pr-3 pl-4 transition-opacity lg:py-3 lg:pr-3 lg:pl-4",
          decision === "ignore" && "opacity-55",
        ),
      )}
    >
      <div className="min-w-[10rem] flex-1">
        <p className="truncate text-[15px] font-semibold">{row.title}</p>
        <p className="text-[13px] text-muted-foreground">{row.sub}</p>
      </div>
      <span
        className={cn(
          "shrink-0 text-[15px] font-semibold tabular-nums",
          row.positive && "text-positive",
        )}
      >
        {row.amount}
      </span>
      <div
        role="group"
        aria-label={`O que fazer com ${row.title}`}
        className="flex rounded-full bg-muted p-0.5"
      >
        {(
          [
            ["add", "Adicionar"],
            ["ignore", "Ignorar"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={decision === value}
            onClick={() => onDecide(value)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-150",
              decision === value
                ? value === "add"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-foreground shadow-surface ring-1 ring-foreground/10"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </li>
  );
}
