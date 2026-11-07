"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";

/**
 * Termina o primeiro uso e leva ao resultado. Recusa sem renda: sem ela não
 * existe período nem "quanto posso gastar hoje" — é o único passo obrigatório.
 */
export async function finishOnboarding() {
  const userId = await requireUserId();
  const incomes = await prisma.income.count({ where: { userId, deletedAt: null } });
  if (incomes === 0) redirect("/comecar?passo=1");

  await prisma.user.update({ where: { id: userId }, data: { onboardedAt: new Date() } });
  revalidatePath("/", "layout");
  redirect("/comecar/pronto");
}

/**
 * Tirar uma renda ou conta no meio do primeiro uso: um engano de digitação, não
 * um encerramento. Apaga de verdade, e com ela o recebimento ou o pagamento que
 * o "já caiu"/"já paguei" do passo gravou — o apagar comum mantém a linha e
 * deixaria esse dinheiro no Histórico e no período, por uma renda ou conta que
 * nunca existiu. Só antes de terminar o primeiro uso; depois, valem os de
 * sempre.
 */
async function stillOnboarding(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { onboardedAt: true } });
  return user != null && user.onboardedAt == null;
}

export async function discardOnboardingIncome(id: string) {
  const userId = await requireUserId();
  if (!(await stillOnboarding(userId))) throw new Error("O primeiro uso já terminou");
  await prisma.income.deleteMany({ where: { id, userId } });
  revalidatePath("/comecar");
}

export async function discardOnboardingExpense(id: string) {
  const userId = await requireUserId();
  if (!(await stillOnboarding(userId))) throw new Error("O primeiro uso já terminou");
  await prisma.fixedExpense.deleteMany({ where: { id, userId } });
  revalidatePath("/comecar");
}
