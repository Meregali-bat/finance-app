"use client";

import { useState, useTransition } from "react";
import { CircleCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { homeCard } from "@/components/home-card";
import { SectionLabel } from "@/components/page-header";
import { applyStatementFix, reviewStatementWithAi } from "@/lib/actions/statement-review";
import type { ReviewIssue } from "@/lib/statement/review-issues";
import { unwrap } from "@/lib/action-result";
import { errorMessage } from "@/lib/error-message";
import { formatCurrency } from "@/lib/format";

const KIND_LABEL: Record<ReviewIssue["kind"], string> = {
  amount: "Valor diferente",
  ownTransfer: "Transferência entre suas contas",
  duplicate: "Lançado duas vezes",
  direction: "Entrada e saída trocadas",
  other: "Outra coisa",
};

/** "2026-10-07" → "07/10". */
const shortDay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
/** Assinado como no banco: positivo saiu, negativo entrou. */
const signed = (amount: number) =>
  amount < 0 ? `+${formatCurrency(-amount)}` : `−${formatCurrency(amount)}`;

/**
 * Conferir com a IA o que a importação deixou errado no app: ela lê o mesmo
 * PDF por conta própria e aponta valor diferente, transferência entre contas
 * próprias lançada como gasto ou receita, duplicado e sentido trocado. Cada
 * correção é um toque.
 */
export function StatementAiReview({ file }: { file: File }) {
  const [hint, setHint] = useState("");
  const [issues, setIssues] = useState<ReviewIssue[] | null>(null);
  const [checked, setChecked] = useState(0);
  const [resolved, setResolved] = useState<Record<number, "fixed" | "ignored">>({});
  const [error, setError] = useState<string | null>(null);
  const [reviewing, startReviewing] = useTransition();
  const [saving, startSaving] = useTransition();

  function review() {
    setError(null);
    const data = new FormData();
    data.set("file", file);
    data.set("hint", hint);
    startReviewing(async () => {
      try {
        const result = unwrap(await reviewStatementWithAi(data));
        setIssues(result.issues);
        setChecked(result.checked);
        setResolved({});
      } catch (e) {
        setError(errorMessage(e, "Não deu para conferir agora. Tente de novo."));
      }
    });
  }

  function fix(index: number, issue: ReviewIssue) {
    if (!issue.record || !issue.fix) return;
    const input = { transactionId: issue.record.id, fix: issue.fix };
    setError(null);
    startSaving(async () => {
      try {
        unwrap(await applyStatementFix(input));
        setResolved((current) => ({ ...current, [index]: "fixed" }));
      } catch (e) {
        setError(errorMessage(e, "Não deu para corrigir. Tente de novo."));
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>Algo errado no que foi importado?</SectionLabel>
      <div className={homeCard("flex flex-col gap-3")}>
        <p className="text-[13px] text-muted-foreground">
          A IA lê este extrato de novo e confere com os lançamentos do app no período: valores
          diferentes, transferências entre suas contas (como PJ e PF) lançadas como gasto ou
          receita, lançamentos repetidos e entradas e saídas trocadas.
        </p>
        <Input
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          placeholder="O que parece errado? (opcional)"
          maxLength={500}
          aria-label="O que parece errado"
        />
        <div>
          <Button type="button" variant="outline" onClick={review} disabled={reviewing}>
            <Sparkles aria-hidden="true" />
            {reviewing ? "Conferindo..." : issues ? "Conferir de novo" : "Conferir com a IA"}
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}

      {issues && issues.length === 0 && (
        <div className={homeCard("flex items-center gap-3")}>
          <CircleCheck className="size-6 shrink-0 text-positive" aria-hidden="true" />
          <p className="text-sm">
            A IA conferiu {checked} lançamentos do app com o extrato e não achou nada errado.
          </p>
        </div>
      )}

      {issues && issues.length > 0 && (
        <ul className="flex flex-col gap-2">
          {issues.map((issue, index) => {
            const state = resolved[index];
            return (
              <li key={index} className={homeCard("flex flex-col gap-2")}>
                <p className="text-[12.5px] font-semibold text-primary">{KIND_LABEL[issue.kind]}</p>
                {issue.record && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">No app: </span>
                    {shortDay(issue.record.date)} · {issue.record.description} ·{" "}
                    <span className="tabular-nums">{signed(issue.record.amount)}</span>
                  </p>
                )}
                {issue.statementDescription && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">No extrato: </span>
                    {issue.statementDate ? `${shortDay(issue.statementDate)} · ` : ""}
                    {issue.statementDescription}
                    {issue.statementAmount != null && (
                      <span className="tabular-nums">
                        {" "}
                        · {formatCurrency(Math.abs(issue.statementAmount))}
                      </span>
                    )}
                  </p>
                )}
                <p className="text-[13px] text-muted-foreground">{issue.explanation}</p>
                {state ? (
                  <p className="text-[13px] font-medium text-positive">
                    {state === "fixed" ? "Corrigido." : "Ignorado."}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {issue.fix && (
                      <Button type="button" size="sm" disabled={saving} onClick={() => fix(index, issue)}>
                        {issue.fix.type === "delete"
                          ? "Apagar do app"
                          : `Corrigir para ${signed(issue.fix.amount)}`}
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setResolved((current) => ({ ...current, [index]: "ignored" }))}
                    >
                      Ignorar
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
