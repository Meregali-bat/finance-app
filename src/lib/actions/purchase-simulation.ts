"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { accountBalanceOf, loadBudgetInputs } from "@/lib/budget-inputs";
import { calculateCurrentBudget } from "@/lib/carry-over";
import {
  DEFAULT_COMMITMENT_LIMIT_PERCENT,
  MAX_SIMULATION_INSTALLMENTS,
  simulatePurchase,
  type PurchaseSimulation,
} from "@/lib/purchase-simulation";

/**
 * O resultado como o cliente recebe: datas em ISO, do mesmo jeito que
 * `PendingPeriodClose` faz. Serializar à mão em vez de confiar no codec de Date
 * do RSC mantém o contrato explícito e legível no DevTools.
 */
export interface PurchaseSimulationView
  extends Omit<PurchaseSimulation, "firstDueDate" | "lastDueDate" | "periods" | "worstPeriod"> {
  firstDueDate: string | null;
  lastDueDate: string | null;
  periods: PeriodImpactView[];
  worstOffset: number | null;
  /** O teto aplicado e se ele veio do padrão, para a tela poder dizer qual é. */
  commitmentLimitPercent: number;
  usingDefaultLimit: boolean;
}

export interface PeriodImpactView {
  offset: number;
  periodStart: string;
  periodEnd: string;
  installmentAmount: number;
  installmentCount: number;
  balanceBefore: number;
  balanceAfter: number;
  dailyBefore: number;
  dailyAfter: number;
  commitmentStart: string;
  commitmentEnd: string;
  commitmentBefore: number | null;
  commitmentAfter: number | null;
  alreadyFailing: boolean;
}

/**
 * Espelha `purchaseSchema` de actions/card.ts campo a campo, e é isso que faz o
 * botão "Comprei" funcionar sem redigitar nada: o mesmo FormData que simulou
 * serve a `createCardPurchase`. O teto de parcelas é menor de propósito — a
 * compra aceita 48, mas acima de 24 a busca por uma alternativa fica cara e a
 * resposta deixa de ser útil.
 */
const simulationSchema = z.object({
  cardId: z.string().trim().min(1, "Escolha um cartão"),
  amount: z.coerce.number().positive("Valor deve ser maior que zero"),
  date: z.coerce.date(),
  installments: z.coerce.number().int().min(1).max(MAX_SIMULATION_INSTALLMENTS).default(1),
});

export async function runPurchaseSimulation(
  formData: FormData,
): Promise<PurchaseSimulationView> {
  const userId = await requireUserId();
  const purchase = simulationSchema.parse({
    cardId: formData.get("cardId"),
    amount: formData.get("amount"),
    date: formData.get("date"),
    // `||` e não `??`: o campo limpo chega como "" e z.coerce.number() faria
    // dele 0, que estouraria o min(1) em vez de significar "à vista".
    installments: formData.get("installments") || 1,
  });

  const [inputs, user] = await Promise.all([
    // Os mesmos dados da Previsão, com as mesmas regras para o que está
    // desligado — ver loadBudgetInputs.
    loadBudgetInputs(userId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { commitmentLimitPercent: true },
    }),
  ]);

  const configured = user?.commitmentLimitPercent ?? null;
  const commitmentLimitPercent = configured ?? DEFAULT_COMMITMENT_LIMIT_PERCENT;

  const today = new Date();
  // A projeção parte do saldo com que o ciclo corrente abre, como a Previsão:
  // a sobra dos meses anteriores (ou o dinheiro na conta) também paga parcela.
  const { openingBalance } = calculateCurrentBudget({
    ...inputs,
    accountBalance: accountBalanceOf(inputs, today),
    today,
  });

  const result = simulatePurchase({
    ...inputs,
    openingBalance,
    today,
    purchase,
    commitmentLimitPercent,
  });

  const { firstDueDate, lastDueDate, periods, worstPeriod, ...rest } = result;

  return {
    ...rest,
    firstDueDate: firstDueDate?.toISOString() ?? null,
    lastDueDate: lastDueDate?.toISOString() ?? null,
    worstOffset: worstPeriod?.offset ?? null,
    periods: periods.map((period) => ({
      offset: period.offset,
      periodStart: period.periodStart.toISOString(),
      periodEnd: period.periodEnd.toISOString(),
      installmentAmount: period.installmentAmount,
      installmentCount: period.installmentCount,
      balanceBefore: period.balanceBefore,
      balanceAfter: period.balanceAfter,
      dailyBefore: period.dailyBefore,
      dailyAfter: period.dailyAfter,
      commitmentStart: period.commitment.start.toISOString(),
      commitmentEnd: period.commitment.end.toISOString(),
      commitmentBefore: period.commitment.before,
      commitmentAfter: period.commitment.after,
      alreadyFailing: period.alreadyFailing,
    })),
    commitmentLimitPercent,
    usingDefaultLimit: configured === null,
  };
}

/**
 * O piso é 10 e não 0: um teto de 0% reprova literalmente qualquer compra, e o
 * usuário leria isso como defeito do app, não como a configuração que ele pôs.
 */
const commitmentLimitSchema = z.object({
  commitmentLimitPercent: z.coerce.number().int().min(10).max(100),
});

export async function setCommitmentLimit(formData: FormData) {
  const userId = await requireUserId();
  const data = commitmentLimitSchema.parse({
    commitmentLimitPercent: formData.get("commitmentLimitPercent"),
  });

  await prisma.user.update({ where: { id: userId }, data });
  revalidatePath("/");
}
