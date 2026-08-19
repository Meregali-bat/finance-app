import { prisma } from "@/lib/prisma";
import type {
  CardBillEstimateInput,
  CardPurchaseInput,
  CreditCardInput,
  ExpensePaymentInput,
  FixedExpenseInput,
  IncomeInput,
  IncomeReceiptInput,
  TransactionInput,
} from "@/lib/period";

/**
 * As entradas puras de `period.ts` acrescidas do rótulo que a tela mostra.
 * Cada uma é um superset do tipo original, então continuam servindo a
 * `calculateDailyBudget` sem conversão nenhuma.
 */
export type NamedIncomeInput = IncomeInput & { label: string };
export type NamedFixedExpenseInput = FixedExpenseInput & { label: string };
export type NamedCreditCardInput = CreditCardInput & { name: string };
export type NamedTransactionInput = TransactionInput & { id: string; description: string };

export interface BudgetInputs {
  incomes: NamedIncomeInput[];
  incomeReceipts: IncomeReceiptInput[];
  fixedExpenses: NamedFixedExpenseInput[];
  creditCards: NamedCreditCardInput[];
  cardPurchases: CardPurchaseInput[];
  billEstimates: CardBillEstimateInput[];
  expensePayments: ExpensePaymentInput[];
  transactions: NamedTransactionInput[];
}

/**
 * Tudo que as contas de período precisam, numa consulta só e já convertido de
 * `Decimal` para `number` — nada de Prisma atravessa para os módulos puros.
 *
 * `activeOnly` decide se rendas, despesas fixas e cartões desativados entram.
 * O fechamento de período precisa deles (o ciclo que passou existiu com eles
 * ligados); a previsão, não — projetar uma renda que o usuário desligou
 * inventaria dinheiro que não vai chegar.
 */
export async function loadBudgetInputs(
  userId: string,
  { activeOnly = false }: { activeOnly?: boolean } = {},
): Promise<BudgetInputs> {
  const activeFilter = activeOnly ? { active: true } : {};

  const [
    incomes,
    incomeReceipts,
    fixedExpenses,
    creditCards,
    transactions,
    expensePayments,
    billEstimates,
  ] = await Promise.all([
    prisma.income.findMany({ where: { userId, ...activeFilter } }),
    prisma.incomeReceipt.findMany({ where: { userId } }),
    prisma.fixedExpense.findMany({ where: { userId, ...activeFilter } }),
    prisma.creditCard.findMany({
      where: { userId, ...activeFilter },
      include: { purchases: true },
    }),
    prisma.transaction.findMany({ where: { userId } }),
    prisma.expensePayment.findMany({ where: { userId } }),
    prisma.cardBillEstimate.findMany({ where: { userId } }),
  ]);

  return {
    incomes: incomes.map((i) => ({
      id: i.id,
      label: i.label,
      amount: Number(i.amount),
      dayOfMonth: i.dayOfMonth,
      createdAt: i.createdAt,
    })),
    incomeReceipts: incomeReceipts.map((r) => ({
      incomeId: r.incomeId,
      occurrenceDate: r.occurrenceDate,
      amount: Number(r.amount),
    })),
    fixedExpenses: fixedExpenses.map((e) => ({
      id: e.id,
      label: e.label,
      amount: Number(e.amount),
      dueDay: e.dueDay ?? undefined,
      createdAt: e.createdAt,
      cardId: e.cardId ?? undefined,
    })),
    creditCards: creditCards.map((c) => ({
      id: c.id,
      name: c.name,
      closingDay: c.closingDay,
      dueDay: c.dueDay,
    })),
    cardPurchases: creditCards.flatMap((c) =>
      c.purchases.map((p) => ({
        cardId: c.id,
        amount: Number(p.amount),
        date: p.date,
        installments: p.installments,
      })),
    ),
    billEstimates: billEstimates.map((e) => ({
      cardId: e.cardId,
      dueDate: e.dueDate,
      amount: Number(e.amount),
    })),
    expensePayments: expensePayments.map((p) => ({
      // null vira undefined: period.ts compara os dois lados por igualdade
      // estrita, e null !== undefined faria o pagamento nunca casar.
      fixedExpenseId: p.fixedExpenseId ?? undefined,
      cardId: p.cardId ?? undefined,
      dueDate: p.dueDate,
      amount: Number(p.amount),
    })),
    transactions: transactions.map((t) => ({
      id: t.id,
      description: t.description,
      amount: Number(t.amount),
      date: t.date,
    })),
  };
}
