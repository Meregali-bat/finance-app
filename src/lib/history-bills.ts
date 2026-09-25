/**
 * As faturas de um cartão abertas nas linhas que as compõem, para o Histórico.
 *
 * O orçamento e a previsão contam o cartão pela fatura: cada parcela no mês em
 * que a fatura dela vence. O Histórico contava a compra inteira no dia em que
 * foi feita, e os dois nunca batiam — um 12x aparecia todo no mês da compra.
 * Além disso, o que a fatura cobra e não é compra (a anuidade e o IOF lançados
 * à mão, a diferença entre o previsto e o que foi pago) não aparecia em lugar
 * nenhum, porque o pagamento da fatura fica de fora do gasto para não contar
 * as compras duas vezes.
 *
 * Aqui cada fatura que vence no intervalo vira uma linha por pedaço, pelas
 * mesmas funções que montam o valor dela em period.ts: somadas, as linhas de
 * uma fatura dão exatamente o que ela cobrou.
 */

import {
  buildCardBills,
  cardBillFixedExpenses,
  installmentSlices,
  storedDay,
  type CardBillEstimateInput,
  type CardPurchaseInput,
  type CreditCardInput,
  type ExpensePaymentInput,
  type FixedExpenseInput,
} from "./period";

export type BillLine =
  | {
      kind: "installment";
      cardId: string;
      dueDate: Date;
      amount: number;
      purchaseId: string;
      /** 1 para a primeira parcela. */
      installmentNumber: number;
      installmentCount: number;
    }
  | { kind: "subscription"; cardId: string; dueDate: Date; amount: number; fixedExpenseId: string }
  | { kind: "estimate"; cardId: string; dueDate: Date; amount: number; estimateId: string }
  /**
   * Quanto o pagamento da fatura passou do previsto (juros, uma compra não
   * lançada) ou ficou abaixo dele (um estorno). É o que falta para as linhas
   * somarem o que de fato saiu da conta.
   */
  | { kind: "adjustment"; cardId: string; dueDate: Date; amount: number };

const EPSILON = 0.005;

function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

export function billLinesInRange(input: {
  card: CreditCardInput;
  purchases: (CardPurchaseInput & { id: string })[];
  cardFixedExpenses?: FixedExpenseInput[];
  billEstimates?: (CardBillEstimateInput & { id: string })[];
  expensePayments?: ExpensePaymentInput[];
  /** Faturas com vencimento em [start, end). */
  start: Date;
  end: Date;
}): BillLine[] {
  const {
    card,
    purchases,
    cardFixedExpenses = [],
    billEstimates = [],
    expensePayments = [],
    start,
    end,
  } = input;

  const ownPurchases = purchases.filter((p) => p.cardId === card.id);
  const bills = buildCardBills({
    card,
    purchases: ownPurchases,
    cardFixedExpenses,
    billEstimates,
    expensePayments,
    from: start,
    months: monthsBetween(start, end) + 2,
  }).filter((bill) => bill.dueDate.getTime() < end.getTime());

  const slices = ownPurchases.flatMap((purchase) =>
    installmentSlices(purchase, card.closingDay).map((slice, index, all) => ({
      ...slice,
      purchaseId: purchase.id,
      installmentNumber: index + 1,
      installmentCount: all.length,
    })),
  );

  return bills.flatMap((bill): BillLine[] => {
    const base = { cardId: card.id, dueDate: bill.dueDate };

    const installments: BillLine[] = slices
      .filter((slice) => slice.cycleEnd.getTime() === bill.cycleEnd.getTime())
      .map((slice) => ({
        ...base,
        kind: "installment",
        amount: slice.amount,
        purchaseId: slice.purchaseId,
        installmentNumber: slice.installmentNumber,
        installmentCount: slice.installmentCount,
      }));

    const subscriptions: BillLine[] = cardBillFixedExpenses({
      card,
      cardFixedExpenses,
      dueDate: bill.dueDate,
    }).map((expense) => ({
      ...base,
      kind: "subscription",
      amount: expense.amount,
      fixedExpenseId: expense.id,
    }));

    const estimates: BillLine[] = billEstimates
      .filter(
        (e) =>
          e.cardId === card.id && storedDay(e.dueDate).getTime() === bill.dueDate.getTime(),
      )
      .map((e) => ({ ...base, kind: "estimate", amount: e.amount, estimateId: e.id }));

    const difference = bill.paid ? (bill.paidAmount ?? 0) - bill.amount : 0;
    const adjustment: BillLine[] =
      Math.abs(difference) >= EPSILON ? [{ ...base, kind: "adjustment", amount: difference }] : [];

    return [...installments, ...subscriptions, ...estimates, ...adjustment];
  });
}
