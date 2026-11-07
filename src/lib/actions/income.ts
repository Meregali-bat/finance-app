"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { refusing } from "@/lib/action-result";
import { arrivedPaydayToConfirm } from "@/lib/period";

const incomeSchema = z.object({
  label: z.string().trim().min(1, "Informe um nome").max(80),
  amount: z.coerce.number().positive("Valor deve ser maior que zero"),
  dayOfMonth: z.coerce.number().int().min(1).max(31),
});

export async function createIncome(formData: FormData) {
  return refusing(async () => {
    const userId = await requireUserId();
    const data = incomeSchema.parse({
      label: formData.get("label"),
      amount: formData.get("amount"),
      dayOfMonth: formData.get("dayOfMonth"),
    });

    const income = await prisma.income.create({ data: { ...data, userId } });

    // "Já caiu o deste mês" (o primeiro uso pergunta): confirma o pagamento
    // que o lembrete "Recebeu?" perguntaria. O saldo em conta não o soma de
    // novo — um recebimento de um dia até o da leitura já estava nela.
    const payday =
      formData.get("receivedThisMonth") === "1"
        ? arrivedPaydayToConfirm(
            { id: income.id, amount: data.amount, dayOfMonth: data.dayOfMonth, createdAt: income.createdAt },
            income.createdAt,
          )
        : null;
    if (payday) {
      await prisma.incomeReceipt.create({
        data: { incomeId: income.id, userId, occurrenceDate: payday, amount: data.amount },
      });
    }
    revalidatePath("/rendas");
    revalidatePath("/");
    revalidatePath("/previsao");
    revalidatePath("/historico");
  });
}

export async function updateIncome(id: string, formData: FormData) {
  return refusing(async () => {
    const userId = await requireUserId();
    const data = incomeSchema.parse({
      label: formData.get("label"),
      amount: formData.get("amount"),
      dayOfMonth: formData.get("dayOfMonth"),
    });

    await prisma.income.update({
      where: { id, userId },
      data,
    });
    revalidatePath("/rendas");
    revalidatePath("/");
    revalidatePath("/previsao");
    revalidatePath("/historico");
  });
}

/**
 * Apagar tira a renda das listas e dos períodos, mas mantém a linha: os
 * recebimentos dela são dinheiro que entrou, e o cascade de um delete de
 * verdade os levaria junto — do Histórico, do saldo em conta e dos meses que
 * eles pagaram.
 */
export async function deleteIncome(id: string) {
  const userId = await requireUserId();
  await prisma.income.update({
    where: { id, userId },
    data: { active: false, deletedAt: new Date() },
  });
  revalidatePath("/rendas");
  revalidatePath("/");
  revalidatePath("/historico");
  revalidatePath("/previsao");
}

export async function toggleIncomeActive(id: string, active: boolean) {
  const userId = await requireUserId();
  await prisma.income.update({ where: { id, userId }, data: { active } });
  revalidatePath("/rendas");
  revalidatePath("/");
  revalidatePath("/previsao");
  revalidatePath("/historico");
}
