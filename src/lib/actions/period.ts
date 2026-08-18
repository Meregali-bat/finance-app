"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import {
  calculateDailyBudget,
  getPeriodBounds,
  getPreviousPeriodBounds,
  type CreditCardInput,
  type FixedExpenseInput,
  type IncomeInput,
} from "@/lib/period";

async function loadBudgetInputs(userId: string) {
  const [
    incomes,
    incomeReceipts,
    fixedExpenses,
    creditCards,
    transactions,
    expensePayments,
    billEstimates,
  ] = await Promise.all([
      prisma.income.findMany({ where: { userId } }),
      prisma.incomeReceipt.findMany({ where: { userId } }),
      prisma.fixedExpense.findMany({ where: { userId } }),
      prisma.creditCard.findMany({ where: { userId }, include: { purchases: true } }),
      prisma.transaction.findMany({ where: { userId } }),
      prisma.expensePayment.findMany({ where: { userId } }),
      prisma.cardBillEstimate.findMany({ where: { userId } }),
    ]);

  const incomeInputs: IncomeInput[] = incomes.map((i) => ({
    id: i.id,
    amount: Number(i.amount),
    dayOfMonth: i.dayOfMonth,
    createdAt: i.createdAt,
  }));
  const fixedExpenseInputs: FixedExpenseInput[] = fixedExpenses.map((e) => ({
    id: e.id,
    amount: Number(e.amount),
    dueDay: e.dueDay ?? undefined,
    createdAt: e.createdAt,
    cardId: e.cardId ?? undefined,
  }));
  const creditCardInputs: CreditCardInput[] = creditCards.map((c) => ({
    id: c.id,
    closingDay: c.closingDay,
    dueDay: c.dueDay,
  }));
  const cardPurchaseInputs = creditCards.flatMap((c) =>
    c.purchases.map((p) => ({
      cardId: c.id,
      amount: Number(p.amount),
      date: p.date,
      installments: p.installments,
    })),
  );
  const transactionInputs = transactions.map((t) => ({ amount: Number(t.amount), date: t.date }));

  return {
    incomes: incomeInputs,
    incomeReceipts: incomeReceipts.map((r) => ({
      incomeId: r.incomeId,
      occurrenceDate: r.occurrenceDate,
      amount: Number(r.amount),
    })),
    fixedExpenses: fixedExpenseInputs,
    creditCards: creditCardInputs,
    cardPurchases: cardPurchaseInputs,
    billEstimates: billEstimates.map((e) => ({
      cardId: e.cardId,
      dueDate: e.dueDate,
      amount: Number(e.amount),
    })),
    expensePayments: expensePayments.map((p) => ({
      fixedExpenseId: p.fixedExpenseId ?? undefined,
      cardId: p.cardId ?? undefined,
      dueDate: p.dueDate,
      amount: Number(p.amount),
    })),
    transactions: transactionInputs,
  };
}

export interface PendingPeriodClose {
  periodStart: string;
  periodEnd: string;
  leftoverAmount: number;
}

/**
 * Checks whether the period that just ended (before today's current period)
 * still needs a jar allocation decision. Periods with leftover <= 0 are
 * auto-resolved silently since there's nothing to allocate.
 */
export async function getPendingPeriodClose(): Promise<PendingPeriodClose | null> {
  const userId = await requireUserId();
  const today = new Date();
  const inputs = await loadBudgetInputs(userId);

  const { periodStart } = getPeriodBounds(inputs.incomes, today, inputs.incomeReceipts);
  const previous = getPreviousPeriodBounds(inputs.incomes, periodStart, inputs.incomeReceipts);

  if (previous.periodEnd.getTime() !== periodStart.getTime()) {
    return null;
  }

  const existing = await prisma.periodAllocation.findUnique({
    where: { userId_periodEnd: { userId, periodEnd: previous.periodEnd } },
  });
  if (existing?.resolvedAt) return null;

  const lastDayOfPreviousPeriod = new Date(previous.periodEnd);
  lastDayOfPreviousPeriod.setDate(lastDayOfPreviousPeriod.getDate() - 1);

  const previousBudget = calculateDailyBudget({
    ...inputs,
    today: lastDayOfPreviousPeriod,
  });
  const leftoverAmount = previousBudget.periodBalance;

  if (leftoverAmount <= 0) {
    await prisma.periodAllocation.upsert({
      where: { userId_periodEnd: { userId, periodEnd: previous.periodEnd } },
      update: { resolvedAt: new Date(), leftoverAmount },
      create: {
        userId,
        periodStart: previous.periodStart,
        periodEnd: previous.periodEnd,
        leftoverAmount,
        resolvedAt: new Date(),
      },
    });
    return null;
  }

  await prisma.periodAllocation.upsert({
    where: { userId_periodEnd: { userId, periodEnd: previous.periodEnd } },
    update: { leftoverAmount },
    create: {
      userId,
      periodStart: previous.periodStart,
      periodEnd: previous.periodEnd,
      leftoverAmount,
    },
  });

  return {
    periodStart: previous.periodStart.toISOString(),
    periodEnd: previous.periodEnd.toISOString(),
    leftoverAmount,
  };
}

export async function resolvePeriodAllocation(
  periodEndIso: string,
  leftoverAmount: number,
  jarId: string | null,
) {
  const userId = await requireUserId();
  const periodEnd = new Date(periodEndIso);

  const allocation = await prisma.periodAllocation.findUnique({
    where: { userId_periodEnd: { userId, periodEnd } },
  });
  if (!allocation || allocation.resolvedAt) return;

  await prisma.$transaction(async (tx) => {
    if (jarId) {
      await tx.jarDeposit.create({
        data: { jarId, userId, amount: leftoverAmount, note: "Sobra do período anterior" },
      });
      await tx.jar.update({
        where: { id: jarId, userId },
        data: { balance: { increment: leftoverAmount } },
      });
    } else {
      await tx.transaction.create({
        data: {
          userId,
          amount: -leftoverAmount,
          description: "Saldo do período anterior",
          date: new Date(),
        },
      });
    }
    await tx.periodAllocation.update({
      where: { id: allocation.id },
      data: { resolvedAt: new Date() },
    });
  });

  revalidatePath("/");
  revalidatePath("/caixinhas");
  revalidatePath("/historico");
}
