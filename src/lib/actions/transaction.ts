"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { parseLoanFields, syncLoan } from "@/lib/loan-sync";

const transactionSchema = z.object({
  description: z.string().trim().min(1, "Informe uma descrição").max(120),
  amount: z.coerce.number().positive("Valor deve ser maior que zero"),
  type: z.enum(["expense", "income"]).default("expense"),
  date: z.coerce.date().optional(),
  categoryId: z.string().trim().optional().nullable(),
});

export async function createTransaction(formData: FormData) {
  const userId = await requireUserId();
  const data = transactionSchema.parse({
    description: formData.get("description"),
    amount: formData.get("amount"),
    type: formData.get("type") || undefined,
    date: formData.get("date") || undefined,
    categoryId: formData.get("categoryId"),
  });

  // Só despesa se empresta; uma receita nunca leva empréstimo.
  const loan = data.type === "expense" ? parseLoanFields(formData) : null;

  await prisma.$transaction(async (tx) => {
    const created = await tx.transaction.create({
      data: {
        userId,
        description: data.description,
        amount: data.type === "income" ? -data.amount : data.amount,
        categoryId: data.categoryId || null,
        ...(data.date ? { date: data.date } : {}),
      },
      select: { id: true },
    });
    if (loan) await syncLoan(tx, userId, { transactionId: created.id }, loan, data.amount);
  });
  revalidatePath("/");
  revalidatePath("/historico");
}

export async function updateTransaction(id: string, formData: FormData) {
  const userId = await requireUserId();
  const data = transactionSchema.parse({
    description: formData.get("description"),
    amount: formData.get("amount"),
    type: formData.get("type") || undefined,
    date: formData.get("date") || undefined,
    categoryId: formData.get("categoryId"),
  });

  const loan = data.type === "expense" ? parseLoanFields(formData) : null;

  await prisma.$transaction(async (tx) => {
    await tx.transaction.update({
      where: { id, userId },
      data: {
        description: data.description,
        amount: data.type === "income" ? -data.amount : data.amount,
        categoryId: data.categoryId || null,
        ...(data.date ? { date: data.date } : {}),
      },
    });
    // Desligar o "emprestado" na edição apaga o empréstimo.
    await syncLoan(tx, userId, { transactionId: id }, loan, data.amount);
  });
  revalidatePath("/");
  revalidatePath("/historico");
}

export async function deleteTransaction(id: string) {
  const userId = await requireUserId();
  await prisma.transaction.delete({ where: { id, userId } });
  revalidatePath("/");
  revalidatePath("/historico");
}
