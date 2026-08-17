import { dateOnlyInputValue } from "@/lib/format";

/** Um lançamento do mês, vindo de qualquer uma das três tabelas de gasto. */
export type HistoryItem = {
  id: string;
  kind: "transaction" | "card" | "fixedExpensePayment" | "cardBillPayment" | "incomeReceipt";
  description: string;
  /** Assinado: receita é negativa, como está no banco. */
  amount: number;
  date: Date;
  /**
   * Quando o lançamento foi cadastrado — de onde sai a hora exibida. Só existe
   * para lançamentos (transaction/card); confirmações trazem o próprio instante
   * em `date`.
   */
  createdAt?: Date | null;
  categoryId: string | null;
  cardId?: string;
  cardName?: string;
  /** Presente quando kind === "incomeReceipt": a receita fixa que foi confirmada. */
  incomeId?: string;
};

/** Os valores que o formulário de edição espera. */
export type MovementValues = {
  id: string;
  /** Qual tabela guarda o lançamento — decide qual action roda no submit. */
  kind: "transaction" | "card";
  description: string;
  /** Sempre positivo: o sinal de receita é reposto pela action. */
  amount: number;
  /** "YYYY-MM-DD", para o `<input type="date">`. */
  date: string;
  type: "expense" | "income";
  categoryId: string | null;
  /** Presente quando kind === "card". */
  cardId?: string;
};

/** Ids colidem entre tabelas, então a chave de lista precisa do kind junto. */
export function historyItemKey(item: HistoryItem) {
  return `${item.kind}-${item.id}`;
}

export function toMovementValues(item: HistoryItem): MovementValues {
  return {
    id: item.id,
    kind: item.kind === "card" ? "card" : "transaction",
    description: item.description,
    amount: Math.abs(item.amount),
    date: dateOnlyInputValue(item.date),
    type: item.amount < 0 ? "income" : "expense",
    categoryId: item.categoryId,
    cardId: item.cardId,
  };
}
