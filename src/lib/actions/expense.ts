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
  // Uma despesa pausada foi cobrada pela última vez quando a pausa começou:
  // encerrá-la hoje deixaria a pausa aberta decidir o mesmo corte, mas ler o
  // encerramento pela pausa deixa a linha dizer a verdade sozinha.
  const openPause = await prisma.fixedExpensePause.findFirst({
    where: { fixedExpenseId: id, userId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
  await prisma.fixedExpense.updateMany({
    where: { id, userId, endedAt: null },
    data: { endedAt: openPause?.startedAt ?? now },
  });
  await prisma.fixedExpense.update({
    where: { id, userId },
    data: { active: false, deletedAt: now },
  });
  revalidatePath("/rendas");
  revalidatePath("/");
  revalidatePath("/historico");
}

/**
 * Pausar abre um intervalo; reativar fecha o intervalo aberto. Nenhum dos dois
 * apaga o outro: os meses pausados continuam sem cobrança depois que a despesa
 * volta — antes, reativar limpava a data do corte e esses meses voltavam a ser
 * cobrados, derrubando o saldo por um dinheiro que nunca saiu.
 */
export async function toggleFixedExpenseActive(id: string, active: boolean) {
  const userId = await requireUserId();
  const now = new Date();
  const expense = await prisma.fixedExpense.findUnique({ where: { id, userId } });
  if (!expense) throw new Error("Despesa não encontrada");

  await prisma.$transaction(async (tx) => {
    if (active) {
      await tx.fixedExpensePause.updateMany({
        where: { fixedExpenseId: id, userId, endedAt: null },
        data: { endedAt: now },
      });
    } else if (expense.active) {
      await tx.fixedExpensePause.create({
        data: { fixedExpenseId: id, userId, startedAt: now },
      });
    }
    await tx.fixedExpense.update({ where: { id, userId }, data: { active } });
  });
  revalidatePath("/rendas");
  revalidatePath("/");
  revalidatePath("/historico");
  revalidatePath("/previsao");
}
