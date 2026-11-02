"use client";

import { useState, useTransition } from "react";
import { CircleCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { homeCard } from "@/components/home-card";
import { checkBillWithAi, type BillCheckResult } from "@/lib/actions/bill-check";
import { deleteCardBillEstimate } from "@/lib/actions/card-bill-estimate";
import { deleteCardPurchase } from "@/lib/actions/card";
import { unwrap } from "@/lib/action-result";
import { errorMessage } from "@/lib/error-message";
import { formatCurrency } from "@/lib/format";

const KIND_LABEL: Record<BillCheckResult["findings"][number]["kind"], string> = {
  estimate: "Previsão no mês errado?",
  duplicate: "Compra repetida",
  subscription: "Assinatura",
  bank_difference: "Diferença com as prints",
  other: "Outra coisa",
};

/** O total da última conferência pelas prints, guardada no aparelho (card-screenshot-check). */
function savedPrints(cardId: string) {
  try {
    const raw = localStorage.getItem(`card-shots:${cardId}`);
    if (!raw) return null;
    const lines = (JSON.parse(raw) as { lines: { date: string; amount: number }[] }).lines;
    if (!lines?.length) return null;
    const dates = lines.map((l) => l.date).sort();
    const total = Math.round(lines.reduce((sum, l) => sum + l.amount, 0) * 100) / 100;
    return { from: dates[0], to: dates[dates.length - 1], total };
  } catch {
    return null;
  }
}

/** "2026-11-19" → "19/11". */
const shortDay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Conferir a próxima fatura com a IA: ela olha cada compra, assinatura e
 * previsão (e as prints do banco, se houver uma conferência guardada) e
 * aponta o que parece errado. Cada correção é um toque; nada muda sozinho.
 */
export function BillAiCheck({ cardId }: { cardId: string }) {
  const [result, setResult] = useState<BillCheckResult | null>(null);
  const [done, setDone] = useState<Record<number, "fixed" | "ignored">>({});
  const [error, setError] = useState<string | null>(null);
  const [checking, startChecking] = useTransition();
  const [saving, startSaving] = useTransition();

  function check() {
    setError(null);
    startChecking(async () => {
      try {
        setResult(unwrap(await checkBillWithAi(cardId, savedPrints(cardId))));
        setDone({});
      } catch (e) {
        setError(errorMessage(e, "Não deu para conferir agora. Tente de novo."));
      }
    });
  }

  function fix(index: number, finding: BillCheckResult["findings"][number]) {
    const action = finding.fix;
    if (!action) return;
    setError(null);
    startSaving(async () => {
      try {
        if (action.type === "deleteEstimate") await deleteCardBillEstimate(action.id, cardId);
        else await deleteCardPurchase(action.id, cardId);
        setDone((current) => ({ ...current, [index]: "fixed" }));
      } catch (e) {
        setError(errorMessage(e, "Não deu para corrigir. Tente de novo."));
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className={homeCard("flex flex-col items-start gap-2")}>
        <p className="text-[13px] text-muted-foreground">
          A IA confere a próxima fatura item por item (compras, assinaturas e previsões) e, se você
          conferiu prints do banco, compara com elas.
        </p>
        <Button type="button" variant="outline" onClick={check} disabled={checking}>
          <Sparkles aria-hidden="true" />
          {checking ? "Conferindo..." : result ? "Conferir de novo" : "Conferir fatura com a IA"}
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}

      {result && (
        <div className={homeCard("flex flex-col gap-3")}>
          <p className="text-sm">
            <span className="font-semibold tabular-nums">
              Fatura de {shortDay(result.dueDate)}: {formatCurrency(result.total)}.
            </span>{" "}
            {result.summary}
          </p>
          {result.findings.length === 0 ? (
            <p className="flex items-center gap-2 text-sm">
              <CircleCheck className="size-5 shrink-0 text-positive" aria-hidden="true" />
              Nada parece errado nesta fatura.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {result.findings.map((finding, index) => (
                <li key={index} className="flex flex-col gap-1.5 border-t border-(--hairline) pt-3">
                  <p className="text-[12.5px] font-semibold text-primary">{KIND_LABEL[finding.kind]}</p>
                  <p className="text-[13.5px]">{finding.explanation}</p>
                  {done[index] ? (
                    <p className="text-[13px] font-medium text-positive">
                      {done[index] === "fixed" ? "Corrigido." : "Ignorado."}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {finding.fix && (
                        <Button
                          type="button"
                          size="sm"
                          disabled={saving}
                          onClick={() => fix(index, finding)}
                        >
                          {finding.fix.label}
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setDone((current) => ({ ...current, [index]: "ignored" }))}
                      >
                        Ignorar
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
