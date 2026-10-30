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

const yieldSchema = z.object({
  // Vazio desliga: a caixinha volta a não mostrar rendimento.
  cdiPercent: z.coerce.number().min(1).max(300).nullable(),
});

/** Quanto do CDI a caixinha rende: é o que a simulação de rendimento usa. */
export async function setJarYield(jarId: string, formData: FormData) {
  const userId = await requireUserId();
  const raw = String(formData.get("cdiPercent") ?? "")
    .replace(",", ".")
    .trim();
  const { cdiPercent } = yieldSchema.parse({ cdiPercent: raw === "" ? null : raw });
  await prisma.jar.update({ where: { id: jarId, userId }, data: { cdiPercent } });
  revalidatePath("/caixinhas");
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
  // O dia em que o dinheiro entrou ou saiu de verdade: é dele que o
  // rendimento e o IOF contam. Ausente ou hoje, vale o agora.
  date: z.iso.date().optional(),
  // Guardado com data para voltar: a Previsão conta com ele de volta nesse dia.
  plannedWithdrawalAt: z.iso.date().optional(),
});

/**
 * O instante gravado para um movimento com data escolhida: meio-dia daquele
 * dia no fuso do app, longe da virada para outro dia. Hoje (ou sem data) é o
 * agora, como sempre foi. Não aceita data no futuro.
 */
function movementInstant(date: string | undefined): Date | undefined {
  if (!date) return undefined;
  const [y, m, d] = date.split("-").map(Number);
  const now = new Date();
  const chosen = new Date(y, m - 1, d, 12);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (chosen.getTime() >= today.getTime() + 86_400_000) {
    throw new Error("A data não pode ser depois de hoje.");
  }
  if (chosen.getTime() >= today.getTime()) return undefined;
  return chosen;
}

export async function depositToJar(jarId: string, formData: FormData) {
  const userId = await requireUserId();
  const data = depositSchema.parse({
    amount: formData.get("amount"),
    note: formData.get("note") || undefined,
    date: formData.get("date") || undefined,
    plannedWithdrawalAt: formData.get("plannedWithdrawalAt") || undefined,
  });
  const createdAt = movementInstant(data.date);
  const plannedWithdrawalAt = data.plannedWithdrawalAt
    ? new Date(`${data.plannedWithdrawalAt}T00:00:00.000Z`)
    : null;
  if (plannedWithdrawalAt && data.date && data.plannedWithdrawalAt! <= data.date) {
    throw new Error("O dia de tirar precisa ser depois do dia em que entrou.");
  }

  const [deposit] = await prisma.$transaction([
    prisma.jarDeposit.create({
      data: {
        amount: data.amount,
        note: data.note,
        createdAt,
        plannedWithdrawalAt,
        jarId,
        userId,
      },
      select: { id: true },
    }),
    prisma.jar.update({
      where: { id: jarId, userId },
      data: { balance: { increment: data.amount } },
    }),
  ]);

  revalidatePath("/caixinhas");
  revalidatePath("/");
  revalidatePath("/previsao");
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
    date: formData.get("date") || undefined,
  });
  const createdAt = movementInstant(data.date);

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
        createdAt,
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

const scheduleSchema = z.object({
  amount: z.coerce.number().positive("Valor deve ser maior que zero"),
  date: z.iso.date(),
});

/**
 * Dá data de volta para dinheiro que já estava na caixinha: a Previsão conta
 * com ele de volta nesse dia, como um depósito feito com data para tirar.
 */
export async function scheduleJarWithdrawal(jarId: string, formData: FormData) {
  const userId = await requireUserId();
  const data = scheduleSchema.parse({
    amount: formData.get("amount"),
    date: formData.get("date"),
  });
  const jar = await prisma.jar.findUnique({ where: { id: jarId, userId } });
  if (!jar) throw new Error("Caixinha não encontrada");
  if (data.amount > Number(jar.balance) + 0.005) {
    throw new Error("O valor passa do que está na caixinha.");
  }
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (data.date < today) throw new Error("A data de tirar não pode ser antes de hoje.");

  await prisma.jarWithdrawalPlan.create({
    data: {
      userId,
      jarId,
      amount: data.amount,
      date: new Date(`${data.date}T00:00:00.000Z`),
    },
  });
  revalidatePath("/caixinhas");
  revalidatePath("/");
  revalidatePath("/previsao");
}

/** O que o "Desfazer" precisa para pôr uma data de volta como estava. */
export type CancelledJarReturn =
  | { kind: "schedule"; id: string; jarId: string; amount: number; date: string; createdAt: string }
  | { kind: "deposit"; id: string; plannedWithdrawalAt: string };

/**
 * Tira a data de volta: o dinheiro fica na caixinha sem previsão de sair.
 * Devolve o que havia, para o "Desfazer" repor — tirar a data muda o número
 * do dia, e um toque errado não pode ficar sem volta.
 */
export async function cancelJarReturn(source: {
  kind: "deposit" | "schedule";
  id: string;
}): Promise<CancelledJarReturn | null> {
  const userId = await requireUserId();
  let cancelled: CancelledJarReturn | null = null;
  if (source.kind === "schedule") {
    const plan = await prisma.jarWithdrawalPlan.findFirst({ where: { id: source.id, userId } });
    if (plan) {
      await prisma.jarWithdrawalPlan.delete({ where: { id: plan.id } });
      cancelled = {
        kind: "schedule",
        id: plan.id,
        jarId: plan.jarId,
        amount: Number(plan.amount),
        date: plan.date.toISOString(),
        createdAt: plan.createdAt.toISOString(),
      };
    }
  } else {
    const deposit = await prisma.jarDeposit.findFirst({ where: { id: source.id, userId } });
    if (deposit?.plannedWithdrawalAt) {
      await prisma.jarDeposit.update({
        where: { id: deposit.id },
        data: { plannedWithdrawalAt: null },
      });
      cancelled = {
        kind: "deposit",
        id: deposit.id,
        plannedWithdrawalAt: deposit.plannedWithdrawalAt.toISOString(),
      };
    }
  }
  revalidatePath("/caixinhas");
  revalidatePath("/");
  revalidatePath("/previsao");
  return cancelled;
}

/** O "Desfazer" de `cancelJarReturn`: a data volta, com o mesmo id e a mesma ordem. */
export async function restoreJarReturn(cancelled: CancelledJarReturn) {
  const userId = await requireUserId();
  if (cancelled.kind === "schedule") {
    const jar = await prisma.jar.findFirst({ where: { id: cancelled.jarId, userId } });
    if (!jar) throw new Error("Caixinha não encontrada");
    await prisma.jarWithdrawalPlan.create({
      data: {
        id: cancelled.id,
        userId,
        jarId: jar.id,
        amount: cancelled.amount,
        date: new Date(cancelled.date),
        createdAt: new Date(cancelled.createdAt),
      },
    });
  } else {
    await prisma.jarDeposit.updateMany({
      where: { id: cancelled.id, userId },
      data: { plannedWithdrawalAt: new Date(cancelled.plannedWithdrawalAt) },
    });
  }
  revalidatePath("/caixinhas");
  revalidatePath("/");
  revalidatePath("/previsao");
}
