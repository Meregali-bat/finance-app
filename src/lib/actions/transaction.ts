"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";

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

  await prisma.transaction.create({
    data: {
      userId,
      description: data.description,
      amount: data.type === "income" ? -data.amount : data.amount,
      categoryId: data.categoryId || null,
      ...(data.date ? { date: data.date } : {}),
    },
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
