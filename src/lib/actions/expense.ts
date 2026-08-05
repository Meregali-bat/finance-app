"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";

const expenseSchema = z.object({
  label: z.string().trim().min(1, "Informe um nome").max(80),
  amount: z.coerce.number().positive("Valor deve ser maior que zero"),
  dueDay: z.coerce.number().int().min(1).max(31),
  cardId: z.string().trim().optional().nullable(),
});

export async function createFixedExpense(formData: FormData) {
  const userId = await requireUserId();
  const { cardId, ...data } = expenseSchema.parse({
    label: formData.get("label"),
    amount: formData.get("amount"),
    dueDay: formData.get("dueDay"),
    cardId: formData.get("cardId"),
  });

  await prisma.fixedExpense.create({ data: { ...data, cardId: cardId || null, userId } });
  revalidatePath("/despesas");
  revalidatePath("/");
}

export async function updateFixedExpense(id: string, formData: FormData) {
  const userId = await requireUserId();
  const { cardId, ...data } = expenseSchema.parse({
    label: formData.get("label"),
    amount: formData.get("amount"),
    dueDay: formData.get("dueDay"),
    cardId: formData.get("cardId"),
  });

  await prisma.fixedExpense.update({ where: { id, userId }, data: { ...data, cardId: cardId || null } });
  revalidatePath("/despesas");
  revalidatePath("/");
}

export async function deleteFixedExpense(id: string) {
  const userId = await requireUserId();
  await prisma.fixedExpense.delete({ where: { id, userId } });
  revalidatePath("/despesas");
  revalidatePath("/");
}

export async function toggleFixedExpenseActive(id: string, active: boolean) {
  const userId = await requireUserId();
  await prisma.fixedExpense.update({ where: { id, userId }, data: { active } });
  revalidatePath("/despesas");
  revalidatePath("/");
}
