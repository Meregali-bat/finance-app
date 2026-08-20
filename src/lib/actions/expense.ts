"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";

const expenseSchema = z
  .object({
    label: z.string().trim().min(1, "Informe um nome").max(80),
    amount: z.coerce.number().positive("Valor deve ser maior que zero"),
    dueDay: z.preprocess(
      (v) => (v === "" || v == null ? undefined : v),
      z.coerce.number().int().min(1).max(31).optional(),
    ),
    cardId: z.string().trim().optional().nullable(),
    categoryId: z.string().trim().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (!data.cardId && data.dueDay == null) {
      ctx.addIssue({ code: "custom", message: "Informe o dia do vencimento", path: ["dueDay"] });
    }
  });

export async function createFixedExpense(formData: FormData) {
  const userId = await requireUserId();
  const { cardId, dueDay, categoryId, ...data } = expenseSchema.parse({
    label: formData.get("label"),
    amount: formData.get("amount"),
    dueDay: formData.get("dueDay"),
    cardId: formData.get("cardId"),
    categoryId: formData.get("categoryId"),
  });

  await prisma.fixedExpense.create({
    data: {
      ...data,
      dueDay: cardId ? null : (dueDay ?? null),
      cardId: cardId || null,
      categoryId: categoryId || null,
      userId,
    },
  });
  revalidatePath("/rendas");
  revalidatePath("/");
  revalidatePath("/historico");
}

export async function updateFixedExpense(id: string, formData: FormData) {
  const userId = await requireUserId();
  const { cardId, dueDay, categoryId, ...data } = expenseSchema.parse({
    label: formData.get("label"),
    amount: formData.get("amount"),
    dueDay: formData.get("dueDay"),
    cardId: formData.get("cardId"),
    categoryId: formData.get("categoryId"),
  });

  await prisma.fixedExpense.update({
    where: { id, userId },
    data: {
      ...data,
      dueDay: cardId ? null : (dueDay ?? null),
      cardId: cardId || null,
      categoryId: categoryId || null,
    },
  });
  revalidatePath("/rendas");
  revalidatePath("/");
  revalidatePath("/historico");
}

/**
 * Apagar é encerrar, não deletar a linha.
 *
 * Uma assinatura cobrada no cartão não tem registro próprio — o Histórico a
 * deriva desta linha —, e uma despesa avulsa levaria junto os pagamentos dela
 * por cascade. Nos dois casos, deletar de verdade apagaria retroativamente
 * dinheiro que de fato saiu. `endedAt` para de cobrá-la das ocorrências
 * seguintes; `deletedAt` a tira da lista de Fixos.
 */
export async function deleteFixedExpense(id: string) {
  const userId = await requireUserId();
  const now = new Date();
  // Primeiro o corte, e só onde ainda não existe um: apagar uma despesa que já
  // estava pausada não deve empurrar o encerramento para hoje e ressuscitar as
  // ocorrências do meio do caminho.
  await prisma.fixedExpense.updateMany({
    where: { id, userId, endedAt: null },
    data: { endedAt: now },
  });
  await prisma.fixedExpense.update({
    where: { id, userId },
    data: { active: false, deletedAt: now },
  });
  revalidatePath("/rendas");
  revalidatePath("/");
  revalidatePath("/historico");
}

export async function toggleFixedExpenseActive(id: string, active: boolean) {
  const userId = await requireUserId();
  await prisma.fixedExpense.update({
    where: { id, userId },
    // Reativar limpa a data, e com ela o corte: as ocorrências do intervalo
    // pausado voltam a contar. A vigência é um intervalo só, não um histórico
    // deles — guardar cada pausa exigiria uma tabela à parte, e o caso que
    // custa dinheiro é o encerramento definitivo, que `deletedAt` cobre.
    data: { active, endedAt: active ? null : new Date() },
  });
  revalidatePath("/rendas");
  revalidatePath("/");
  revalidatePath("/historico");
}
