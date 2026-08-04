"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";

const cardSchema = z.object({
  name: z.string().trim().min(1, "Informe um nome").max(80),
  closingDay: z.coerce.number().int().min(1).max(31),
  dueDay: z.coerce.number().int().min(1).max(31),
});

export async function createCreditCard(formData: FormData) {
  const userId = await requireUserId();
  const data = cardSchema.parse({
    name: formData.get("name"),
    closingDay: formData.get("closingDay"),
    dueDay: formData.get("dueDay"),
  });

  await prisma.creditCard.create({ data: { ...data, userId } });
  revalidatePath("/cartoes");
  revalidatePath("/");
}

export async function updateCreditCard(id: string, formData: FormData) {
  const userId = await requireUserId();
  const data = cardSchema.parse({
    name: formData.get("name"),
    closingDay: formData.get("closingDay"),
    dueDay: formData.get("dueDay"),
  });

  await prisma.creditCard.update({ where: { id, userId }, data });
  revalidatePath("/cartoes");
  revalidatePath("/");
}

export async function deleteCreditCard(id: string) {
  const userId = await requireUserId();
  await prisma.creditCard.delete({ where: { id, userId } });
  revalidatePath("/cartoes");
  revalidatePath("/");
}

const purchaseSchema = z.object({
  description: z.string().trim().min(1, "Informe uma descrição").max(120),
  amount: z.coerce.number().positive("Valor deve ser maior que zero"),
  date: z.coerce.date(),
});

export async function createCardPurchase(cardId: string, formData: FormData) {
  const userId = await requireUserId();
  const data = purchaseSchema.parse({
    description: formData.get("description"),
    amount: formData.get("amount"),
    date: formData.get("date"),
  });

  await prisma.cardPurchase.create({ data: { ...data, cardId, userId } });
  revalidatePath(`/cartoes/${cardId}`);
  revalidatePath("/cartoes");
  revalidatePath("/");
  revalidatePath("/historico");
}

export async function deleteCardPurchase(id: string, cardId: string) {
  const userId = await requireUserId();
  await prisma.cardPurchase.delete({ where: { id, userId } });
  revalidatePath(`/cartoes/${cardId}`);
  revalidatePath("/cartoes");
  revalidatePath("/");
  revalidatePath("/historico");
}
