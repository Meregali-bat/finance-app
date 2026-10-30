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
  /** A despesa foi emprestada: quem vai devolver ("Ana e Bruno"). */
  lentTo?: string;
  /**
   * Quanto desta linha é de outra pessoa: a soma dos empréstimos, na mesma
   * proporção da parcela quando é uma compra parcelada. Sai do saldo, mas não
   * é gasto seu — volta quando a pessoa devolver.
   */
  lent?: number;
  /** Receita que é alguém devolvendo um empréstimo: entra no saldo, não é renda. */
  loanRepayment?: boolean;
  /** Dinheiro entre contas da própria pessoa: nem renda nem gasto. */
  transfer?: boolean;
  /** Pagamento de fatura ou conta: falso quando foi só uma parte. */
  settled?: boolean;
  /** A fatia escolhida para este lançamento; ausente = a da categoria. */
  slice?: string | null;
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
  /** Lançamento entre contas da própria pessoa. */
  transfer?: boolean;
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
    transfer: item.transfer,
  };
}

/**
 * O dia do lançamento como "YYYY-MM-DD", o mesmo do calendário de gastos: a
 * compra no cartão no dia em que foi feita (e não no vencimento da fatura que
 * cobra a parcela), lançamentos pelo dia de calendário que guardam em UTC, e o
 * resto — pagamentos, confirmações, caixinhas — pelo dia local do instante.
 */
export function itemDayKey(item: HistoryItem): string {
  if (item.kind === "card" && item.purchaseDate)
    return item.purchaseDate.toISOString().slice(0, 10);
  if (item.kind === "transaction") return item.date.toISOString().slice(0, 10);
  const d = item.date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const names = new Intl.ListFormat("pt-BR", { type: "conjunction" });

/** "Ana", "Ana e Bruno", "Ana, Bruno e Carla"; nada quando não foi emprestada. */
export function lentNames(loans: { person: { name: string } }[]): string | undefined {
  return loans.length > 0 ? names.format(loans.map((l) => l.person.name)) : undefined;
}
