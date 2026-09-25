"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";

const paymentSchema = z.object({
  dueDate: z.coerce.date(),
  amount: z.coerce.number().positive("Valor deve ser maior que zero"),
  /** "YYYY-MM-DD", do campo "Pago em". Ausente = hoje. */
  paidOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
    .optional(),
});

/**
 * Uma ocorrência é identificada pelo dia, não por um instante. Normalizar
 * mantém a chave única estável, não importa que horas venham junto da data.
 */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Quando o dinheiro saiu, e não quando o usuário apertou o botão.
 *
 * É por esta data que o saldo em conta sabe se o pagamento já estava no
 * extrato lido no último ajuste — uma fatura paga dia 2 e marcada dia 6 não
 * pode sair do saldo de novo se ele foi corrigido dia 4. E é por ela que o
 * Histórico põe o pagamento no mês certo.
 *
 * Hoje continua sendo o instante de agora, como era. Outro dia vira a
 * meia-noite local dele, montada das partes da string: `new Date("2026-09-08")`
 * seria meia-noite UTC, que num servidor em fuso negativo cai no dia 7.
 */
function paidAtFrom(paidOn: string | undefined, now: Date): Date {
  if (!paidOn) return now;
  const [year, month, day] = paidOn.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getTime() > startOfDay(now).getTime()) {
    throw new Error("A data do pagamento não pode ser no futuro");
  }
  return date.getTime() === startOfDay(now).getTime() ? now : date;
}

function parsePayment(formData: FormData) {
  const data = paymentSchema.parse({
    dueDate: formData.get("dueDate"),
    amount: formData.get("amount"),
    paidOn: formData.get("paidOn") || undefined,
  });
  return {
    dueDate: startOfDay(data.dueDate),
    amount: data.amount,
    paidOn: data.paidOn,
    paidAt: paidAtFrom(data.paidOn, new Date()),
  };
}

export async function markFixedExpensePaid(expenseId: string, formData: FormData) {
  const userId = await requireUserId();
  const { dueDate, amount, paidOn, paidAt } = parsePayment(formData);

  const expense = await prisma.fixedExpense.findUnique({ where: { id: expenseId, userId } });
  if (!expense) throw new Error("Despesa não encontrada");

  const cardId = String(formData.get("cardId") ?? "");
  if (!cardId) {
    await prisma.expensePayment.upsert({
      where: { fixedExpenseId_dueDate: { fixedExpenseId: expenseId, dueDate } },
      create: { userId, fixedExpenseId: expenseId, dueDate, amount, paidAt },
      update: { amount, paidAt },
    });
  } else {
    const card = await prisma.creditCard.findUnique({ where: { id: cardId, userId } });
    if (!card) throw new Error("Cartão não encontrado");

    // Paga no cartão: o dinheiro vira compra e entra na fatura. O pagamento
    // fica com 0 só para quitar a ocorrência — com o valor cheio nos dois
    // lugares, o orçamento cobraria a conta duas vezes.
    await prisma.$transaction(async (tx) => {
      const purchase = await tx.cardPurchase.create({
        data: {
          userId,
          cardId,
          amount,
          description: expense.label,
          categoryId: expense.categoryId,
          // Um dia de calendário em meia-noite UTC, a convenção de
          // CardPurchase.date. O padrão do banco seria o instante de agora,
          // e depois das 21h em Brasília ele já é o dia seguinte em UTC — o
          // que podia jogar a compra na fatura seguinte.
          ...(paidOn ? { date: new Date(`${paidOn}T00:00:00Z`) } : {}),
        },
      });
      await tx.expensePayment.create({
        data: {
          userId,
          fixedExpenseId: expenseId,
          dueDate,
          amount: 0,
          paidAt,
          cardPurchaseId: purchase.id,
        },
      });
    });
    revalidatePath(`/cartoes/${cardId}`);
    revalidatePath("/cartoes");
  }
  revalidatePath("/");
  revalidatePath("/historico");
}

export async function markCardBillPaid(cardId: string, formData: FormData) {
  const userId = await requireUserId();
  const { dueDate, amount, paidAt } = parsePayment(formData);

  const card = await prisma.creditCard.findUnique({ where: { id: cardId, userId } });
  if (!card) throw new Error("Cartão não encontrado");

  await prisma.expensePayment.upsert({
    where: { cardId_dueDate: { cardId, dueDate } },
    create: { userId, cardId, dueDate, amount, paidAt },
    update: { amount, paidAt },
  });
  revalidatePath("/");
  revalidatePath("/historico");
}

export async function unmarkExpensePayment(paymentId: string) {
  const userId = await requireUserId();
  // deleteMany em vez de delete: filtrar por userId aqui é o que impede
  // apagar o pagamento de outra pessoa, e delete jogaria se não achasse.
  // Pago no cartão, a compra vai junto — apagá-la leva o pagamento em cascata.
  await prisma.cardPurchase.deleteMany({ where: { expensePayment: { id: paymentId }, userId } });
  await prisma.expensePayment.deleteMany({ where: { id: paymentId, userId } });
  revalidatePath("/");
  revalidatePath("/historico");
}
