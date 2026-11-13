"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { Refusal, refusing } from "@/lib/action-result";
import {
  getNextPeriodBounds,
  getPeriodBounds,
  nextUnpaidChargeFrom,
  openInstallments,
} from "@/lib/period";
import { toFixedExpenseInput } from "@/lib/budget-inputs";

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

const aheadSchema = z.object({
  /** "YYYY-MM-DD" da cobrança que o diálogo mostrou — tem de ser ainda a próxima. */
  dueDate: z.iso.date(),
  amount: z.number().positive("Informe o valor pago"),
  /** "YYYY-MM-DD" do dia em que o dinheiro saiu. */
  paidOn: z.iso.date("Data inválida"),
});

/**
 * Paga adiantada a próxima cobrança de uma conta fixa que vence depois do
 * ciclo de agora — o aluguel do dia 10 pago antes do salário do dia 5.
 *
 * Um pagamento comum (`markFixedExpensePaid`) com o valor cheio contaria o
 * dinheiro duas vezes: o saldo em conta já cai agora, e a cobrança do ciclo
 * seguinte pesaria de novo na Previsão. Então é o mesmo desenho do adiantamento
 * de parcelas: o dinheiro vira um lançamento no dia em que saiu — entra no
 * ciclo de agora, no número do dia e no Histórico daquele mês — e a cobrança
 * fica quitada por um pagamento de 0. Desfazer é `undoInstallmentAdvance`.
 *
 * Dentro do ciclo de agora isto não é preciso: o "Pagar" da Início já aceita
 * pagar antes do vencimento, e ali o pagamento comum é o certo.
 */
export async function payNextChargeAhead(expenseId: string, input: unknown) {
  return refusing(async () => {
    const userId = await requireUserId();
    const { dueDate, amount, paidOn } = aheadSchema.parse(input);
    const [expense, incomes, receipts] = await Promise.all([
      prisma.fixedExpense.findUnique({
        where: { id: expenseId, userId },
        include: {
          pauses: true,
          deferrals: true,
          payments: { where: { settled: true }, select: { dueDate: true } },
        },
      }),
      prisma.income.findMany({ where: { userId } }),
      prisma.incomeReceipt.findMany({ where: { userId } }),
    ]);
    if (!expense || expense.deletedAt) throw new Refusal("Despesa não encontrada.");
    if (expense.cardId || expense.dueDay == null) {
      throw new Refusal("Só dá para pagar adiantado uma conta fixa com dia de vencimento, fora do cartão.");
    }

    const now = new Date();
    const [year, month, dayOfMonth] = paidOn.split("-").map(Number);
    const paidDay = new Date(year, month - 1, dayOfMonth);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (paidDay.getTime() > todayStart.getTime()) {
      throw new Refusal("A data do pagamento não pode ser no futuro.");
    }

    const incomeInputs = incomes.map((i) => ({
      id: i.id,
      amount: Number(i.amount),
      dayOfMonth: i.dayOfMonth,
      createdAt: i.createdAt,
      active: i.active,
    }));
    const receiptInputs = receipts.map((r) => ({
      incomeId: r.incomeId,
      occurrenceDate: r.occurrenceDate,
      amount: Number(r.amount),
    }));
    const { periodStart, periodEnd } = getPeriodBounds(incomeInputs, now, receiptInputs);
    const nextPeriodEnd = getNextPeriodBounds(incomeInputs, periodEnd, receiptInputs).periodEnd;
    // De um ciclo que já fechou, o lançamento mexeria num período encerrado.
    if (paidDay.getTime() < periodStart.getTime()) {
      throw new Refusal("A data do pagamento tem de ser deste ciclo.");
    }

    const next = nextUnpaidChargeFrom(
      toFixedExpenseInput(expense),
      periodEnd,
      expense.payments.map((p) => p.dueDate),
    );
    if (!next || isoDay(next.dueDate) !== dueDate) {
      throw new Refusal("Essa cobrança já foi paga ou mudou. Abra de novo e confira.");
    }
    // Um ciclo à frente de cada vez: a do ciclo de agora se paga pela Início, e
    // as de depois do seguinte esperam a vez delas.
    if (next.dueDate.getTime() >= nextPeriodEnd.getTime()) {
      throw new Refusal("Dá para adiantar só a cobrança do próximo ciclo.");
    }

    const due = `${String(next.dueDate.getDate()).padStart(2, "0")}/${String(next.dueDate.getMonth() + 1).padStart(2, "0")}`;
    const transaction = await prisma.$transaction(async (tx) => {
      const created = await tx.transaction.create({
        data: {
          userId,
          description: `${expense.label}: vencimento de ${due} pago adiantado`.slice(0, 120),
          amount,
          // Um dia de calendário em meia-noite UTC, a convenção dos lançamentos.
          // Pago antes da última leitura do saldo, ele já estava no extrato e
          // não sai de novo (ver alreadyInReading).
          date: new Date(Date.UTC(year, month - 1, dayOfMonth)),
          categoryId: expense.categoryId,
        },
        select: { id: true },
      });
      await tx.expensePayment.create({
        data: {
          userId,
          fixedExpenseId: expense.id,
          dueDate: new Date(
            Date.UTC(next.dueDate.getFullYear(), next.dueDate.getMonth(), next.dueDate.getDate()),
          ),
          amount: 0,
          paidAt: paidDay.getTime() === todayStart.getTime() ? now : paidDay,
          advanceTransactionId: created.id,
        },
      });
      return created;
    });
    revalidate();
    return { transactionId: transaction.id, dueDate: isoDay(next.dueDate) };
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
