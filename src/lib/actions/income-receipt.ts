"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { EARLY_INCOME_DAYS, earliestPaydayAfter, storedDay } from "@/lib/period";

const receiptSchema = z.object({
  occurrenceDate: z.coerce.date(),
  amount: z.coerce.number().positive("Valor deve ser maior que zero"),
  /**
   * "YYYY-MM-DD": o dia em que caiu, só quando o salário chegou antes do dia
   * cadastrado (o lembrete antecipado). Aí `occurrenceDate` é o dia cadastrado.
   */
  receivedOn: z.iso.date("Data inválida").optional(),
});

/**
 * A payday is identified by its day, not by an instant. Normalizing keeps the
 * unique key stable no matter what time of day rides along with the date.
 */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Um dia de calendário em meia-noite UTC, a convenção dos dias gravados (ver storedDay). */
function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

export async function markIncomeReceived(incomeId: string, formData: FormData) {
  const userId = await requireUserId();
  const data = receiptSchema.parse({
    occurrenceDate: formData.get("occurrenceDate"),
    amount: formData.get("amount"),
    receivedOn: formData.get("receivedOn") || undefined,
  });

  const income = await prisma.income.findUnique({
    where: { id: incomeId, userId },
    include: { receipts: true },
  });
  if (!income) throw new Error("Receita não encontrada");

  let occurrenceDate = startOfDay(data.occurrenceDate);
  let forPayday: Date | null = null;
  if (data.receivedOn) {
    // Antecipado: só o próximo pagamento, e só nos dias logo antes dele. O
    // recebimento fica no dia em que caiu, que é onde o ciclo novo começa.
    const now = new Date();
    const payday = earliestPaydayAfter(
      {
        id: income.id,
        amount: Number(income.amount),
        dayOfMonth: income.dayOfMonth,
        createdAt: income.createdAt,
        active: income.active,
      },
      now,
      income.receipts.map((r) => ({
        incomeId: r.incomeId,
        occurrenceDate: r.occurrenceDate,
        forPayday: r.forPayday,
        amount: Number(r.amount),
      })),
    );
    if (payday.getTime() !== storedDay(data.occurrenceDate).getTime()) {
      throw new Error("Esse pagamento já foi confirmado ou mudou. Abra de novo e confira.");
    }
    const [year, month, day] = data.receivedOn.split("-").map(Number);
    const received = new Date(year, month - 1, day);
    const earliest = new Date(payday.getFullYear(), payday.getMonth(), payday.getDate() - EARLY_INCOME_DAYS);
    if (received.getTime() > startOfDay(now).getTime()) {
      throw new Error("A data em que caiu não pode ser no futuro.");
    }
    if (received.getTime() < earliest.getTime()) {
      throw new Error(`Só dá para confirmar até ${EARLY_INCOME_DAYS} dias antes do dia do pagamento.`);
    }
    occurrenceDate = utcDay(received);
    forPayday = utcDay(payday);
  }

  await prisma.incomeReceipt.upsert({
    where: { incomeId_occurrenceDate: { incomeId, occurrenceDate } },
    create: { incomeId, userId, occurrenceDate, forPayday, amount: data.amount },
    update: { amount: data.amount, forPayday },
  });
  revalidatePath("/");
  revalidatePath("/historico");
  revalidatePath("/previsao");
  revalidatePath("/rendas");
  // O que o "Desfazer" do toast da Início precisa para apagar o recebimento.
  return { incomeId, occurrenceDate };
}

export async function unmarkIncomeReceived(incomeId: string, occurrenceDate: Date) {
  const userId = await requireUserId();
  await prisma.incomeReceipt.deleteMany({
    where: { incomeId, userId, occurrenceDate },
  });
  revalidatePath("/");
  // O recebimento também é uma linha do Histórico, e o total de recebido de lá
  // sai dele.
  revalidatePath("/historico");
  revalidatePath("/previsao");
  revalidatePath("/rendas");
}
