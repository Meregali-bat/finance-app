"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";

const paymentSchema = z.object({
  dueDate: z.coerce.date(),
  amount: z.coerce.number().positive("Valor deve ser maior que zero"),
});

/**
 * Uma ocorrência é identificada pelo dia, não por um instante. Normalizar
 * mantém a chave única estável, não importa que horas venham junto da data.
 */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parsePayment(formData: FormData) {
  const data = paymentSchema.parse({
    dueDate: formData.get("dueDate"),
    amount: formData.get("amount"),
  });
  return { dueDate: startOfDay(data.dueDate), amount: data.amount };
}

export async function markFixedExpensePaid(expenseId: string, formData: FormData) {
  const userId = await requireUserId();
  const { dueDate, amount } = parsePayment(formData);

  const expense = await prisma.fixedExpense.findUnique({ where: { id: expenseId, userId } });
  if (!expense) throw new Error("Despesa não encontrada");

  await prisma.expensePayment.upsert({
    where: { fixedExpenseId_dueDate: { fixedExpenseId: expenseId, dueDate } },
    create: { userId, fixedExpenseId: expenseId, dueDate, amount },
    update: { amount },
  });
  revalidatePath("/");
  revalidatePath("/historico");
}

export async function markCardBillPaid(cardId: string, formData: FormData) {
  const userId = await requireUserId();
  const { dueDate, amount } = parsePayment(formData);

  const card = await prisma.creditCard.findUnique({ where: { id: cardId, userId } });
  if (!card) throw new Error("Cartão não encontrado");

  await prisma.expensePayment.upsert({
    where: { cardId_dueDate: { cardId, dueDate } },
    create: { userId, cardId, dueDate, amount },
    update: { amount },
  });
  revalidatePath("/");
  revalidatePath("/historico");
}

export async function unmarkExpensePayment(paymentId: string) {
  const userId = await requireUserId();
  // deleteMany em vez de delete: filtrar por userId aqui é o que impede
  // apagar o pagamento de outra pessoa, e delete jogaria se não achasse.
  await prisma.expensePayment.deleteMany({ where: { id: paymentId, userId } });
  revalidatePath("/");
  revalidatePath("/historico");
}
