"use client";

import { useState, useTransition } from "react";
import { homeCard } from "@/components/home-card";
import { setItemCategory } from "@/lib/actions/slices";
import { errorMessage } from "@/lib/error-message";
import { formatCurrency } from "@/lib/format";

interface Item {
  id: string;
  kind: string;
  description: string;
  amount: number;
  date: string;
}

/** Onde se dá categoria a cada tipo que não é lançamento nem compra. */
const ELSEWHERE: Record<string, string> = {
  cardFixedExpense: "categoria em Fixos",
  fixedExpensePayment: "categoria em Fixos",
  cardEstimate: "previsão da fatura",
  cardBillAdjustment: "diferença da fatura",
};

/**
 * Os gastos do período sem categoria, cada um com a escolha ali mesmo: um
 * toque e ele passa a contar na fatia da categoria.
 */
export function CategorizeList({
  items,
  categories,
}: {
  items: Item[];
  categories: { id: string; name: string }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function choose(item: Item, categoryId: string) {
    setError(null);
    setSavingId(item.id);
    startTransition(async () => {
      try {
        await setItemCategory({ kind: item.kind, id: item.id, categoryId });
      } catch (e) {
        setError(errorMessage(e, "Não deu para salvar a categoria."));
      } finally {
        setSavingId(null);
      }
    });
  }

  return (
    <>
      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const editable = item.kind === "transaction" || item.kind === "card";
          return (
            <li
              key={`${item.kind}-${item.id}`}
              className={homeCard(
                "flex flex-wrap items-center gap-x-3 gap-y-2 py-3 pr-3 pl-4 lg:py-3 lg:pr-3 lg:pl-4",
              )}
            >
              <div className="min-w-[10rem] flex-1">
                <p className="truncate text-[15px] font-semibold">{item.description}</p>
                <p className="text-[13px] text-muted-foreground">
                  {item.date}
                  {item.kind === "card" ? " · no cartão" : ""}
                </p>
              </div>
              <span className="shrink-0 text-[15px] font-semibold tabular-nums">
                {formatCurrency(item.amount)}
              </span>
              {editable ? (
                <select
                  aria-label={`Categoria de ${item.description}`}
                  defaultValue=""
                  disabled={savingId === item.id}
                  onChange={(e) => e.target.value && choose(item, e.target.value)}
                  className="h-9 rounded-full bg-(--field) px-3 text-[13px] font-medium text-foreground ring-1 ring-(--hairline) disabled:opacity-50"
                >
                  <option value="" disabled>
                    {savingId === item.id ? "Salvando..." : "Escolher categoria"}
                  </option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {ELSEWHERE[item.kind] ?? "sem categoria"}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
    </>
  );
}
