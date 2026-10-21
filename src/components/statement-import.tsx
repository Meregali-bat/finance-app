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
  type StatementDifference,
} from "@/lib/actions/statement";
import { errorMessage } from "@/lib/error-message";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

type Decision = "add" | "ignore";
type Ready = Extract<StatementAnalysis, { ok: true }>;

/** "2026-10-07" → "07 out" — lido como dia de calendário, sem fuso. */
function shortDay(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" })
    .format(new Date(`${iso}T00:00:00.000Z`))
    .replace(".", "");
}

/**
 * Importar o extrato do Nubank: escolher o PDF, ver o que não está no app e
 * decidir linha a linha. Nada é gravado antes de "Confirmar".
 */
export function StatementImport({ categories }: { categories: { id: string; name: string }[] }) {
  const [analysis, setAnalysis] = useState<Ready | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [done, setDone] = useState<{ added: number; ignored: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, startReading] = useTransition();
  const [saving, startSaving] = useTransition();
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  function read(file: File) {
    setError(null);
    setDone(null);
    const data = new FormData();
    data.set("file", file);
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
    const pick = (decision: Decision) =>
      analysis.differences.filter((d) => decisions[d.fingerprint] === decision);
    setError(null);
    startSaving(async () => {
      try {
        const result = await applyStatementDecisions({
          add: pick("add"),
          ignore: pick("ignore").map((d) => d.fingerprint),
        });
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
          O PDF do extrato da conta do Nubank ou do Sicoob, como o app do banco exporta.
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
          <Summary analysis={analysis} />

          {analysis.unmatchedBills.map((bill) => (
            <div
              key={`${bill.date}-${bill.amount}`}
              className="flex items-start gap-3 rounded-[18px] bg-negative/8 px-4 py-3 text-[13px] ring-1 ring-negative/20"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-negative" aria-hidden="true" />
              <p>
                Pagamento de fatura de <b className="tabular-nums">{formatCurrency(bill.amount)}</b>{" "}
                em {shortDay(bill.date)} não está marcado no app. Confira em{" "}
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
              <p className="text-sm">Tudo do extrato já está no app. Nenhuma diferença.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SectionLabel>
                  {analysis.differences.length === 1
                    ? "1 movimentação que não está no app"
                    : `${analysis.differences.length} movimentações que não estão no app`}
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
                {analysis.differences.map((d) => (
                  <DifferenceRow
                    key={d.fingerprint}
                    difference={d}
                    category={d.categoryId ? categoryName.get(d.categoryId) : undefined}
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

function Summary({ analysis }: { analysis: Ready }) {
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
  difference: d,
  category,
  decision,
  onDecide,
}: {
  difference: StatementDifference;
  category?: string;
  decision?: Decision;
  onDecide: (decision: Decision) => void;
}) {
  const incoming = d.direction === "in";
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
        <p className="truncate text-[15px] font-semibold">{d.description}</p>
        <p className="text-[13px] text-muted-foreground">
          {shortDay(d.date)} · {incoming ? "entrada" : "saída"}
          {category ? ` · ${category}` : ""}
        </p>
      </div>
      <span
        className={cn(
          "shrink-0 text-[15px] font-semibold tabular-nums",
          incoming && "text-positive",
        )}
      >
        {incoming ? `+${formatCurrency(d.amount)}` : formatCurrency(d.amount)}
      </span>
      <div
        role="group"
        aria-label={`O que fazer com ${d.description}`}
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
