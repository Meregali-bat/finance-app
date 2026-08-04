"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";

const transactionSchema = z.object({
  description: z.string().trim().min(1, "Informe uma descrição").max(120),
  amount: z.coerce.number().positive("Valor deve ser maior que zero"),
  date: z.coerce.date().optional(),
});

export async function createTransaction(formData: FormData) {
  const userId = await requireUserId();
  const data = transactionSchema.parse({
    description: formData.get("description"),
    amount: formData.get("amount"),
    date: formData.get("date") || undefined,
  });

  await prisma.transaction.create({
    data: {
      userId,
      description: data.description,
      amount: data.amount,
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
