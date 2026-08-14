"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";

const receiptSchema = z.object({
  occurrenceDate: z.coerce.date(),
  amount: z.coerce.number().positive("Valor deve ser maior que zero"),
});

/**
 * A payday is identified by its day, not by an instant. Normalizing keeps the
 * unique key stable no matter what time of day rides along with the date.
 */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export async function markIncomeReceived(incomeId: string, formData: FormData) {
  const userId = await requireUserId();
  const data = receiptSchema.parse({
    occurrenceDate: formData.get("occurrenceDate"),
    amount: formData.get("amount"),
  });
  const occurrenceDate = startOfDay(data.occurrenceDate);

  const income = await prisma.income.findUnique({ where: { id: incomeId, userId } });
  if (!income) throw new Error("Receita não encontrada");

  await prisma.incomeReceipt.upsert({
    where: { incomeId_occurrenceDate: { incomeId, occurrenceDate } },
    create: { incomeId, userId, occurrenceDate, amount: data.amount },
    update: { amount: data.amount },
  });
  revalidatePath("/");
}

export async function unmarkIncomeReceived(incomeId: string, occurrenceDate: Date) {
  const userId = await requireUserId();
  await prisma.incomeReceipt.deleteMany({
    where: { incomeId, userId, occurrenceDate },
  });
  revalidatePath("/");
  // O recebimento também é uma linha do Histórico, e o total de recebido de lá
  // sai dele.
  revalidatePath("/historico");
}
