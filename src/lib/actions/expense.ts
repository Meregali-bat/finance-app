"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { toFixedExpenseInput } from "@/lib/budget-inputs";
import { deferralTargetDate, installmentsStart, startAfterCurrentCharge } from "@/lib/period";

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
    installmentCount: z.preprocess(
      (v) => (v === "" || v == null ? undefined : v),
      // 0 = acabaram: as que já foram continuam no histórico.
      z.coerce.number().int().min(0).max(600).optional(),
    ),
  })
  .superRefine((data, ctx) => {
    if (!data.cardId && data.dueDay == null) {
      ctx.addIssue({ code: "custom", message: "Informe o dia do vencimento", path: ["dueDay"] });
    }
  });

export async function createFixedExpense(formData: FormData) {
  const userId = await requireUserId();
  const { cardId, dueDay, categoryId, installmentCount, ...data } = expenseSchema.parse({
    label: formData.get("label"),
    amount: formData.get("amount"),
    dueDay: formData.get("dueDay"),
    cardId: formData.get("cardId"),
    categoryId: formData.get("categoryId"),
    installmentCount: formData.get("installmentCount"),
  });

  // A cobrança deste mês já foi lançada à mão: a despesa começa na seguinte,
  // para não contar duas vezes (ver startAfterCurrentCharge).
  let createdAt: Date | undefined;
  if (formData.get("skipCurrent") === "1") {
    const card = cardId
      ? await prisma.creditCard.findFirst({ where: { id: cardId, userId } })
      : null;
    createdAt = startAfterCurrentCharge(
      card ? { closingDay: card.closingDay } : { dueDay: dueDay ?? null },
      new Date(),
    );
  }

  await prisma.fixedExpense.create({
    data: {
      ...data,
      ...(createdAt ? { createdAt } : {}),
      dueDay: cardId ? null : (dueDay ?? null),
      // No cartão o parcelamento é da compra, não da despesa.
      installmentCount: cardId ? null : (installmentCount ?? null),
      installmentsFrom: installmentsFromFor(cardId, dueDay, installmentCount, createdAt),
      cardId: cardId || null,
      categoryId: categoryId || null,
      userId,
    },
  });
  revalidatePath("/rendas");
  revalidatePath("/");
  revalidatePath("/historico");
}

/**
 * De onde contam as parcelas: o próximo vencimento ainda não pago a partir de
 * hoje (ou do início da despesa, quando ela começa depois). Sem parcelas, nada.
 */
function installmentsFromFor(
  cardId: string | null | undefined,
  dueDay: number | undefined,
  installmentCount: number | undefined,
  startsAt: Date = new Date(),
  paidDueDates: Date[] = [],
) {
  if (cardId || dueDay == null || installmentCount == null) return null;
  return installmentsStart(dueDay, startsAt, paidDueDates);
}

export async function updateFixedExpense(id: string, formData: FormData) {
  const userId = await requireUserId();
  const { cardId, dueDay, categoryId, installmentCount, ...data } = expenseSchema.parse({
    label: formData.get("label"),
    amount: formData.get("amount"),
    dueDay: formData.get("dueDay"),
    cardId: formData.get("cardId"),
    categoryId: formData.get("categoryId"),
    installmentCount: formData.get("installmentCount"),
  });

  // A parcela deste mês paga adiantada não conta entre as que faltam.
  const paid = await prisma.expensePayment.findMany({
    where: {
      userId,
      fixedExpenseId: id,
      settled: true,
      dueDate: { gte: new Date(Date.now() - 40 * 86_400_000) },
    },
    select: { dueDate: true },
  });

  await prisma.fixedExpense.update({
    where: { id, userId },
    data: {
      ...data,
      dueDay: cardId ? null : (dueDay ?? null),
      // No cartão o parcelamento é da compra, não da despesa.
      installmentCount: cardId ? null : (installmentCount ?? null),
      // O formulário mostra quantas faltam a partir do próximo vencimento, e é
      // de lá que o número salvo conta — salvar sem mexer dá na mesma última
      // parcela.
      installmentsFrom: installmentsFromFor(
        cardId,
        dueDay,
        installmentCount,
        new Date(),
        paid.map((p) => p.dueDate),
      ),
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

const deferralSchema = z.object({
  dueDate: z.coerce.date(),
  amount: z.coerce.number().positive("Valor deve ser maior que zero"),
  mode: z.enum(["nextMonth", "end"]),
});

/** Mesma normalização de markFixedExpensePaid: a ocorrência é um dia. */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Adia uma ocorrência em vez de pagá-la. Ela sai dos lembretes e do orçamento
 * do mês, e o valor informado — que pode ter juros ou multa — vai para o mês
 * seguinte, somado à próxima, ou para depois da última parcela.
 *
 * O alvo é calculado aqui e gravado, para não mudar de lugar se a despesa for
 * editada depois.
 */
export async function deferFixedExpense(expenseId: string, formData: FormData) {
  const userId = await requireUserId();
  const data = deferralSchema.parse({
    dueDate: formData.get("dueDate"),
    amount: formData.get("amount"),
    mode: formData.get("mode"),
  });
  const dueDate = startOfDay(data.dueDate);

  const expense = await prisma.fixedExpense.findUnique({
    where: { id: expenseId, userId },
    include: { pauses: true, deferrals: true, payments: { where: { dueDate } } },
  });
  if (!expense) throw new Error("Despesa não encontrada");
  if (expense.cardId) throw new Error("Uma despesa cobrada no cartão não se adia por aqui");
  // Também com um pagamento parcial: adiar levaria a ocorrência inteira, e o
  // que já foi pago dela deixaria de contar no orçamento.
  if (expense.payments.length > 0) throw new Error("Esta ocorrência já foi paga");

  const targetDueDate = deferralTargetDate(toFixedExpenseInput(expense), dueDate, data.mode);

  await prisma.expenseDeferral.create({
    data: {
      userId,
      fixedExpenseId: expenseId,
      dueDate,
      targetDueDate,
      amount: data.amount,
      mode: data.mode,
    },
  });
  revalidatePath("/");
  revalidatePath("/rendas");
  revalidatePath("/previsao");
}

/** Desfaz um adiamento: a ocorrência volta a ser cobrada e o alvo perde o valor. */
export async function undoExpenseDeferral(id: string) {
  const userId = await requireUserId();
  await prisma.expenseDeferral.deleteMany({ where: { id, userId } });
  revalidatePath("/");
  revalidatePath("/rendas");
  revalidatePath("/previsao");
}
