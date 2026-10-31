"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { Refusal, refusing } from "@/lib/action-result";
import { openInstallments } from "@/lib/period";

const advanceSchema = z.object({
  /** "YYYY-MM-DD" de cada parcela escolhida. */
  dueDates: z.array(z.iso.date()).min(1).max(120),
  paid: z.number().positive("Informe o valor pago"),
});

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function revalidate() {
  revalidatePath("/rendas");
  revalidatePath("/");
  revalidatePath("/historico");
  revalidatePath("/previsao");
}

/**
 * Adianta parcelas escolhidas de uma despesa fixa, pelo valor que o banco
 * cobrou (às vezes com desconto). O dinheiro vira um lançamento de hoje — sai
 * do número do dia e do saldo agora — e cada parcela fica quitada por ele com
 * um pagamento de 0, como a conta paga no cartão. Assim os meses dela não
 * cobram de novo, e o mesmo dinheiro não sai duas vezes.
 */
export async function advanceInstallments(expenseId: string, input: unknown) {
  return refusing(async () => {
    const userId = await requireUserId();
    const { dueDates, paid } = advanceSchema.parse(input);
    const expense = await prisma.fixedExpense.findUnique({
      where: { id: expenseId, userId },
      include: { payments: { where: { settled: true }, select: { dueDate: true } } },
    });
    if (!expense || expense.deletedAt) throw new Refusal("Despesa não encontrada.");
    if (expense.cardId || expense.installmentCount == null || expense.dueDay == null) {
      throw new Refusal("Só dá para adiantar parcelas de uma conta fixa com número de parcelas.");
    }

    const now = new Date();
    const open = openInstallments(
      {
        amount: Number(expense.amount),
        dueDay: expense.dueDay,
        createdAt: expense.createdAt,
        installmentCount: expense.installmentCount,
        installmentsFrom: expense.installmentsFrom ?? undefined,
      },
      now,
      expense.payments.map((p) => p.dueDate),
    );
    const wanted = new Set(dueDates);
    const chosen = open.filter((i) => wanted.has(isoDay(i.dueDate)));
    if (chosen.length !== wanted.size) {
      throw new Refusal("Alguma dessas parcelas já foi paga. Abra de novo e confira.");
    }

    const numbers = chosen.map((i) => i.number);
    const list =
      numbers.length === 1
        ? `parcela ${numbers[0]}`
        : `parcelas ${numbers.slice(0, -1).join(", ")} e ${numbers.at(-1)}`;
    const transaction = await prisma.$transaction(async (tx) => {
      const created = await tx.transaction.create({
        data: {
          userId,
          description: `${expense.label}: ${list} ${numbers.length === 1 ? "adiantada" : "adiantadas"}`.slice(0, 120),
          amount: paid,
          // Um dia de calendário em meia-noite UTC, a convenção dos lançamentos.
          date: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())),
          categoryId: expense.categoryId,
        },
        select: { id: true },
      });
      await tx.expensePayment.createMany({
        data: chosen.map((i) => ({
          userId,
          fixedExpenseId: expense.id,
          dueDate: new Date(
            Date.UTC(i.dueDate.getFullYear(), i.dueDate.getMonth(), i.dueDate.getDate()),
          ),
          amount: 0,
          paidAt: now,
          advanceTransactionId: created.id,
        })),
      });
      return created;
    });
    revalidate();
    const full = chosen.reduce((sum, i) => sum + i.amount, 0);
    return {
      transactionId: transaction.id,
      count: chosen.length,
      discount: Math.max(0, Math.round((full - paid) * 100) / 100),
    };
  });
}

/** Desfaz um adiantamento: o lançamento sai e, com ele, os pagamentos; as parcelas voltam a faltar. */
export async function undoInstallmentAdvance(transactionId: string) {
  return refusing(async () => {
    const userId = await requireUserId();
    const { count } = await prisma.transaction.deleteMany({
      where: { id: transactionId, userId, advancedPayments: { some: {} } },
    });
    if (count === 0) throw new Refusal("Adiantamento não encontrado.");
    revalidate();
    return { ok: true as const };
  });
}
