import { dateOnlyInputValue } from "@/lib/format";

/** Um lançamento do mês, vindo de qualquer uma das três tabelas de gasto. */
export type HistoryItem = {
  id: string;
  kind:
    | "transaction"
    | "card"
    | "fixedExpensePayment"
    | "cardBillPayment"
    /**
     * Uma assinatura cobrada no cartão, aberta a partir da fatura paga que a
     * cobrou. Não é uma linha de tabela: é derivada, e por isso não se edita
     * nem se apaga daqui. Existe porque ela não aparece em nenhuma outra
     * tabela — sem ela, a categoria da assinatura nunca entrava no balde de
     * "Por categoria" e o dinheiro saía sem aparecer em lugar nenhum.
     */
    | "cardFixedExpense"
    /** Um valor lançado à mão na fatura (anuidade, IOF). Editado na tela do cartão. */
    | "cardEstimate"
    /**
     * A diferença entre o que a fatura previa e o que foi pago: juros, uma
     * compra não lançada, um estorno. Sem ela, o que o Histórico soma de um
     * cartão não bateria com o que saiu da conta.
     */
    | "cardBillAdjustment"
    /** Guardado numa caixinha (positivo) ou resgatado dela (negativo). */
    | "jarDeposit"
    | "incomeReceipt";
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
  /** Em quantas parcelas a compra foi dividida, quando kind === "card". */
  installments?: number;
  /**
   * Quando kind === "card", o item é uma parcela: `amount` é o valor dela e
   * `date` é o vencimento da fatura que a cobra — o mesmo mês em que o
   * orçamento a conta. Estes campos guardam a compra inteira, que é o que o
   * formulário de edição altera.
   */
  installmentNumber?: number;
  purchaseAmount?: number;
  purchaseDate?: Date;
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
  /** Em quantas parcelas — só de leitura no formulário, como o cartão. */
  installments?: number;
};

/** Ids colidem entre tabelas, então a chave de lista precisa do kind junto. */
export function historyItemKey(item: HistoryItem) {
  // Duas parcelas da mesma compra podem cair no mesmo intervalo.
  return `${item.kind}-${item.id}${item.installmentNumber ? `-${item.installmentNumber}` : ""}`;
}

export function toMovementValues(item: HistoryItem): MovementValues {
  return {
    id: item.id,
    kind: item.kind === "card" ? "card" : "transaction",
    description: item.description,
    // Uma parcela se edita como a compra inteira: é ela que está no banco.
    amount: item.purchaseAmount ?? Math.abs(item.amount),
    date: dateOnlyInputValue(item.purchaseDate ?? item.date),
    type: item.amount < 0 ? "income" : "expense",
    categoryId: item.categoryId,
    cardId: item.cardId,
    installments: item.installments,
  };
}
