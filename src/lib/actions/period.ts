"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { loadBudgetInputs } from "@/lib/budget-inputs";
import { calculateDailyBudget, getPeriodBounds, getPreviousPeriodBounds } from "@/lib/period";

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
