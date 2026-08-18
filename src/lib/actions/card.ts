"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";

const cardSchema = z.object({
  name: z.string().trim().min(1, "Informe um nome").max(80),
  closingDay: z.coerce.number().int().min(1).max(31),
  dueDay: z.coerce.number().int().min(1).max(31),
  creditLimit: z.coerce.number().positive("Limite deve ser maior que zero").optional(),
});

/**
 * O limite como o formulário manda: CurrencyInput emite "" quando está vazio, e
 * z.coerce.number() transforma "" (e null) em 0 — que passaria a valer como
 * "limite zero" em vez de "sem limite informado". Daí o undefined explícito.
 */
function creditLimitField(formData: FormData) {
  return formData.get("creditLimit") || undefined;
}

export async function createCreditCard(formData: FormData) {
  const userId = await requireUserId();
  const data = cardSchema.parse({
    name: formData.get("name"),
    closingDay: formData.get("closingDay"),
    dueDay: formData.get("dueDay"),
    creditLimit: creditLimitField(formData),
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
    creditLimit: creditLimitField(formData),
  });

  // O null explícito é o que faz apagar o campo apagar a coluna: com
  // `creditLimit: undefined` o Prisma simplesmente não mexe nela.
  await prisma.creditCard.update({
    where: { id, userId },
    data: { ...data, creditLimit: data.creditLimit ?? null },
  });
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
  installments: z.coerce.number().int().min(1).max(48).default(1),
  categoryId: z.string().trim().optional().nullable(),
});

export async function createCardPurchase(cardId: string, formData: FormData) {
  const userId = await requireUserId();
  const { categoryId, ...data } = purchaseSchema.parse({
    description: formData.get("description"),
    amount: formData.get("amount"),
    date: formData.get("date"),
    // `||` e não `??`: o campo limpo chega como "" e z.coerce.number() faria
    // dele 0, que estouraria o min(1) em vez de significar "à vista".
    installments: formData.get("installments") || 1,
    categoryId: formData.get("categoryId"),
  });

  await prisma.cardPurchase.create({
    data: { ...data, categoryId: categoryId || null, cardId, userId },
  });
  revalidatePath(`/cartoes/${cardId}`);
  revalidatePath("/cartoes");
  revalidatePath("/");
  revalidatePath("/historico");
}

export async function updateCardPurchase(id: string, cardId: string, formData: FormData) {
  const userId = await requireUserId();
  const { categoryId, ...data } = purchaseSchema.parse({
    description: formData.get("description"),
    amount: formData.get("amount"),
    date: formData.get("date"),
    // `||` e não `??`: o campo limpo chega como "" e z.coerce.number() faria
    // dele 0, que estouraria o min(1) em vez de significar "à vista".
    installments: formData.get("installments") || 1,
    categoryId: formData.get("categoryId"),
  });

  await prisma.cardPurchase.update({
    where: { id, userId },
    data: { ...data, categoryId: categoryId || null },
  });
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
