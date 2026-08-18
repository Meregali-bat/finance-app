"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";

const estimateSchema = z.object({
  description: z.string().trim().min(1, "Informe uma descrição").max(120),
  amount: z.coerce.number().positive("Valor deve ser maior que zero"),
  dueDate: z.coerce.date(),
});

/**
 * A previsão é identificada pelo dia do vencimento, não por um instante — é
 * assim que ela casa com a fatura calculada em src/lib/period.ts. Mesma
 * normalização de markCardBillPaid, pelo mesmo motivo.
 */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export async function createCardBillEstimate(cardId: string, formData: FormData) {
  const userId = await requireUserId();
  const data = estimateSchema.parse({
    description: formData.get("description"),
    amount: formData.get("amount"),
    dueDate: formData.get("dueDate"),
  });

  const card = await prisma.creditCard.findUnique({ where: { id: cardId, userId } });
  if (!card) throw new Error("Cartão não encontrado");

  await prisma.cardBillEstimate.create({
    data: { ...data, dueDate: startOfDay(data.dueDate), cardId, userId },
  });

  revalidatePath(`/cartoes/${cardId}`);
  revalidatePath("/cartoes");
  revalidatePath("/");
}

export async function deleteCardBillEstimate(id: string, cardId: string) {
  const userId = await requireUserId();
  await prisma.cardBillEstimate.delete({ where: { id, userId } });

  revalidatePath(`/cartoes/${cardId}`);
  revalidatePath("/cartoes");
  revalidatePath("/");
}
