"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";

const jarSchema = z.object({
  name: z.string().trim().min(1, "Informe um nome").max(80),
  color: z.string().trim().max(20).optional().nullable(),
});

export async function createJar(formData: FormData) {
  const userId = await requireUserId();
  const data = jarSchema.parse({
    name: formData.get("name"),
    color: formData.get("color") || undefined,
  });

  await prisma.jar.create({ data: { ...data, userId } });
  revalidatePath("/caixinhas");
  revalidatePath("/");
}

/**
 * Só uma caixinha vazia pode ser apagada, e apagar só a esconde. Os depósitos
 * são dinheiro que saiu do disponível; apagá-los por cascade o devolveria ao
 * saldo e ao orçamento sem nada ter voltado. O saldo sai antes, por um resgate.
 */
export async function deleteJar(id: string) {
  const userId = await requireUserId();
  const jar = await prisma.jar.findUnique({ where: { id, userId } });
  if (!jar) return;
  if (Math.abs(Number(jar.balance)) >= 0.005) {
    throw new Error("Resgate o saldo da caixinha antes de apagá-la.");
  }
  await prisma.jar.update({ where: { id, userId }, data: { deletedAt: new Date() } });
  revalidatePath("/caixinhas");
  revalidatePath("/");
}

const depositSchema = z.object({
  amount: z.coerce.number().positive("Valor deve ser maior que zero"),
  note: z.string().trim().max(120).optional().nullable(),
});

export async function depositToJar(jarId: string, formData: FormData) {
  const userId = await requireUserId();
  const data = depositSchema.parse({
    amount: formData.get("amount"),
    note: formData.get("note") || undefined,
  });

  const [deposit] = await prisma.$transaction([
    prisma.jarDeposit.create({ data: { ...data, jarId, userId }, select: { id: true } }),
    prisma.jar.update({
      where: { id: jarId, userId },
      data: { balance: { increment: data.amount } },
    }),
  ]);

  revalidatePath("/caixinhas");
  revalidatePath("/");
  // O id volta para o "Desfazer" do toast.
  return { depositId: deposit.id };
}

/**
 * Tira dinheiro da caixinha de volta para o disponível. É um depósito com valor
 * negativo: o saldo em conta, o orçamento e a previsão já tratam depósito como
 * saída, então o resgate entra pelo mesmo caminho, com o sinal trocado.
 */
export async function withdrawFromJar(jarId: string, formData: FormData) {
  const userId = await requireUserId();
  const data = depositSchema.parse({
    amount: formData.get("amount"),
    note: formData.get("note") || undefined,
  });

  const jar = await prisma.jar.findUnique({ where: { id: jarId, userId } });
  if (!jar) throw new Error("Caixinha não encontrada");
  // Pode passar do saldo: a caixinha rende (CDB), e o que vier a mais é o
  // rendimento. O saldo vai a zero, nunca negativo; o valor inteiro volta
  // para o disponível.
  const balance = Math.max(0, Number(jar.balance));
  const decrement = Math.min(data.amount, balance);
  const overdraw = data.amount - decrement > 0.005;

  const [deposit] = await prisma.$transaction([
    prisma.jarDeposit.create({
      data: {
        amount: -data.amount,
        note: data.note ?? (overdraw ? "Resgate com rendimento" : "Resgate"),
        ...(overdraw ? { balanceChange: -decrement } : {}),
        jarId,
        userId,
      },
      select: { id: true },
    }),
    prisma.jar.update({
      where: { id: jarId, userId },
      data: { balance: { decrement } },
    }),
  ]);

  revalidatePath("/caixinhas");
  revalidatePath("/");
  revalidatePath("/historico");
  revalidatePath("/previsao");
  return { depositId: deposit.id };
}

/**
 * O "Desfazer" de um guardar ou resgatar: apaga o movimento e devolve o saldo
 * da caixinha ao que era.
 */
export async function undoJarDeposit(depositId: string) {
  const userId = await requireUserId();
  const deposit = await prisma.jarDeposit.findFirst({
    where: { id: depositId, userId, fromPeriodClose: false },
    include: { jar: { select: { balance: true } } },
  });
  if (!deposit) return;
  // O quanto o saldo mudou, que num resgate com rendimento é menos que o
  // valor. Desfazer um depósito depois de já ter resgatado tudo zera a
  // caixinha em vez de deixá-la negativa.
  const change = Number(deposit.balanceChange ?? deposit.amount);
  const balance = Number(deposit.jar.balance);
  const nextBalance = Math.max(0, balance - change);

  await prisma.$transaction([
    prisma.jarDeposit.delete({ where: { id: deposit.id } }),
    prisma.jar.update({
      where: { id: deposit.jarId, userId },
      data: { balance: nextBalance },
    }),
  ]);

  revalidatePath("/caixinhas");
  revalidatePath("/");
  revalidatePath("/historico");
  revalidatePath("/previsao");
}
