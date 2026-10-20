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
