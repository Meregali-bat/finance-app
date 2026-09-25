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

  await prisma.$transaction([
    prisma.jarDeposit.create({ data: { ...data, jarId, userId } }),
    prisma.jar.update({
      where: { id: jarId, userId },
      data: { balance: { increment: data.amount } },
    }),
  ]);

  revalidatePath("/caixinhas");
  revalidatePath("/");
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
  if (data.amount > Number(jar.balance) + 0.005) {
    throw new Error("O valor é maior que o saldo da caixinha");
  }

  await prisma.$transaction([
    prisma.jarDeposit.create({
      data: { amount: -data.amount, note: data.note ?? "Resgate", jarId, userId },
    }),
    prisma.jar.update({
      where: { id: jarId, userId },
      data: { balance: { decrement: data.amount } },
    }),
  ]);

  revalidatePath("/caixinhas");
  revalidatePath("/");
  revalidatePath("/historico");
  revalidatePath("/previsao");
}
