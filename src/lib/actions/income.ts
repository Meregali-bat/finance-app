"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";

const incomeSchema = z.object({
  label: z.string().trim().min(1, "Informe um nome").max(80),
  amount: z.coerce.number().positive("Valor deve ser maior que zero"),
  dayOfMonth: z.coerce.number().int().min(1).max(31),
});

export async function createIncome(formData: FormData) {
  const userId = await requireUserId();
  const data = incomeSchema.parse({
    label: formData.get("label"),
    amount: formData.get("amount"),
    dayOfMonth: formData.get("dayOfMonth"),
  });

  await prisma.income.create({ data: { ...data, userId } });
  revalidatePath("/rendas");
  revalidatePath("/");
}

export async function updateIncome(id: string, formData: FormData) {
  const userId = await requireUserId();
  const data = incomeSchema.parse({
    label: formData.get("label"),
    amount: formData.get("amount"),
    dayOfMonth: formData.get("dayOfMonth"),
  });

  await prisma.income.update({
    where: { id, userId },
    data,
  });
  revalidatePath("/rendas");
  revalidatePath("/");
}

export async function deleteIncome(id: string) {
  const userId = await requireUserId();
  await prisma.income.delete({ where: { id, userId } });
  revalidatePath("/rendas");
  revalidatePath("/");
}

export async function toggleIncomeActive(id: string, active: boolean) {
  const userId = await requireUserId();
  await prisma.income.update({ where: { id, userId }, data: { active } });
  revalidatePath("/rendas");
  revalidatePath("/");
}
