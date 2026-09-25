"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { accountBalanceOf, loadBudgetInputs } from "@/lib/budget-inputs";
import { calculateCurrentBudget } from "@/lib/carry-over";
import { getPreviousPeriodBounds } from "@/lib/period";

export interface PendingPeriodClose {
  periodStart: string;
  periodEnd: string;
  leftoverAmount: number;
}

/**
 * Meio centavo: abaixo disso não há sobra a oferecer — ver o EPSILON de
 * purchase-simulation.ts.
 */
const EPSILON = 0.005;

/**
 * O fechamento do período que acabou de terminar.
 *
 * O saldo passa de um período ao outro sozinho — com sobra ou com falta, sem
 * ninguém precisar decidir nada (ver src/lib/carry-over.ts). O que sobra aqui
 * é uma pergunta só: quando o período anterior deixou dinheiro, quer guardá-lo
 * numa caixinha? Um período que fechou no zero ou no vermelho não tem o que
 * guardar, e é registrado como resolvido sem abrir o diálogo — mas o que
 * faltou continua pesando no período atual.
 *
 * A sobra oferecida é a herança do período atual, a mesma que a Início mostra
 * em "inclui R$ X do período anterior", para os dois números nunca discordarem.
 */
export async function getPendingPeriodClose(): Promise<PendingPeriodClose | null> {
  const userId = await requireUserId();
  const today = new Date();
  const inputs = await loadBudgetInputs(userId);

  const budget = calculateCurrentBudget({
    ...inputs,
    accountBalance: accountBalanceOf(inputs, today),
    today,
  });
  const previous = getPreviousPeriodBounds(
    inputs.incomes,
    budget.periodStart,
    inputs.incomeReceipts,
  );

  if (previous.periodEnd.getTime() !== budget.periodStart.getTime()) {
    return null;
  }

  const existing = await prisma.periodAllocation.findUnique({
    where: { userId_periodEnd: { userId, periodEnd: previous.periodEnd } },
  });
  if (existing?.resolvedAt) return null;

  const leftoverAmount = budget.openingBalance;
  const nothingToKeep = leftoverAmount <= EPSILON;

  await prisma.periodAllocation.upsert({
    where: { userId_periodEnd: { userId, periodEnd: previous.periodEnd } },
    update: { leftoverAmount, ...(nothingToKeep ? { resolvedAt: new Date() } : {}) },
    create: {
      userId,
      periodStart: previous.periodStart,
      periodEnd: previous.periodEnd,
      leftoverAmount,
      resolvedAt: nothingToKeep ? new Date() : null,
    },
  });
  if (nothingToKeep) return null;

  return {
    periodStart: previous.periodStart.toISOString(),
    periodEnd: previous.periodEnd.toISOString(),
    leftoverAmount,
  };
}

/**
 * Responde o fechamento. Sem caixinha, não há o que fazer além de marcar como
 * respondido: a sobra já está no saldo do período atual.
 *
 * Com caixinha, a sobra vira um depósito comum — o mesmo de "Guardar" na tela
 * de Caixinhas. Ele sai do dinheiro disponível, então o período atual passa a
 * contar com menos, e sai do saldo em conta, que trata a caixinha como outro
 * lugar. O valor é o gravado no fechamento, não um que o navegador mandou.
 */
export async function resolvePeriodAllocation(periodEndIso: string, jarId: string | null) {
  const userId = await requireUserId();
  const periodEnd = new Date(periodEndIso);

  const allocation = await prisma.periodAllocation.findUnique({
    where: { userId_periodEnd: { userId, periodEnd } },
  });
  if (!allocation || allocation.resolvedAt) return;

  await prisma.$transaction(async (tx) => {
    if (jarId) {
      const amount = allocation.leftoverAmount;
      await tx.jar.update({
        where: { id: jarId, userId },
        data: { balance: { increment: amount } },
      });
      await tx.jarDeposit.create({
        data: { jarId, userId, amount, note: "Sobra do período anterior" },
      });
    }
    await tx.periodAllocation.update({
      where: { id: allocation.id },
      data: { resolvedAt: new Date() },
    });
  });

  revalidatePath("/");
  revalidatePath("/caixinhas");
  revalidatePath("/previsao");
}
