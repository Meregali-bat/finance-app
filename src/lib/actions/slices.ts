"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireUserId } from "@/lib/auth-helpers";
import { SLICE_KEYS, parseSlices, type SliceKey } from "@/lib/slices";

const sliceKey = z.enum(SLICE_KEYS as [SliceKey, ...SliceKey[]]);

const saveSchema = z.object({
  percents: z.record(z.string(), z.number()),
  categories: z.array(z.object({ id: z.string(), slice: sliceKey })).max(200),
  jars: z.array(z.object({ id: z.string(), slice: z.enum(["goals", "freedom"]) })).max(200),
});

/**
 * Salva as fatias: as porcentagens (que precisam somar 100), a fatia de cada
 * categoria e a de cada caixinha. A partir daqui, o que falta guardar sai do
 * número do dia.
 */
export async function saveSlices(input: unknown) {
  const userId = await requireUserId();
  const { percents, categories, jars } = saveSchema.parse(input);
  const valid = parseSlices(percents);
  if (!valid) throw new Error("As fatias precisam somar 100%.");

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { budgetSlices: valid } }),
    ...categories.map((c) =>
      prisma.category.updateMany({ where: { id: c.id, userId }, data: { slice: c.slice } }),
    ),
    ...jars.map((j) =>
      prisma.jar.updateMany({ where: { id: j.id, userId }, data: { slice: j.slice } }),
    ),
  ]);
  revalidatePath("/", "layout");
}

/** Desliga as fatias: o número do dia volta a usar todo o dinheiro livre. */
export async function disableSlices() {
  const userId = await requireUserId();
  await prisma.user.update({ where: { id: userId }, data: { budgetSlices: Prisma.DbNull } });
  revalidatePath("/", "layout");
}

const itemSchema = z.object({
  kind: z.enum(["transaction", "card"]),
  id: z.string().min(1),
  categoryId: z.string().min(1),
});

/** Dá categoria a um lançamento ou compra que estava sem — o atalho da tela de Metas. */
export async function setItemCategory(input: unknown) {
  const userId = await requireUserId();
  const { kind, id, categoryId } = itemSchema.parse(input);
  await prisma.category.findFirstOrThrow({ where: { id: categoryId, userId } });
  if (kind === "transaction") {
    await prisma.transaction.updateMany({ where: { id, userId }, data: { categoryId } });
  } else {
    await prisma.cardPurchase.updateMany({ where: { id, userId }, data: { categoryId } });
  }
  revalidatePath("/", "layout");
}

const refSchema = z.object({ kind: z.enum(["transaction", "card"]), id: z.string().min(1) });

/** Troca a fatia de um lançamento só; `null` volta a seguir a categoria. */
export async function setItemSlice(input: unknown) {
  const userId = await requireUserId();
  const { kind, id, slice } = refSchema.extend({ slice: sliceKey.nullable() }).parse(input);
  if (kind === "transaction") {
    await prisma.transaction.updateMany({ where: { id, userId }, data: { slice } });
  } else {
    await prisma.cardPurchase.updateMany({ where: { id, userId }, data: { slice } });
  }
  revalidatePath("/", "layout");
}

const bulkSchema = z.object({ items: z.array(refSchema).min(1).max(500) });

/** A mesma categoria para vários lançamentos de uma vez. */
export async function bulkSetCategory(input: unknown) {
  const userId = await requireUserId();
  const { items, categoryId } = bulkSchema.extend({ categoryId: z.string().min(1) }).parse(input);
  await prisma.category.findFirstOrThrow({ where: { id: categoryId, userId } });
  const ids = (kind: "transaction" | "card") =>
    items.filter((i) => i.kind === kind).map((i) => i.id);
  await prisma.$transaction([
    prisma.transaction.updateMany({
      where: { userId, id: { in: ids("transaction") } },
      data: { categoryId },
    }),
    prisma.cardPurchase.updateMany({
      where: { userId, id: { in: ids("card") } },
      data: { categoryId },
    }),
  ]);
  revalidatePath("/", "layout");
}

/**
 * Apaga vários lançamentos de uma vez. Um empréstimo ligado a eles vai junto,
 * como ao apagar um só.
 */
export async function bulkDelete(input: unknown) {
  const userId = await requireUserId();
  const { items } = bulkSchema.parse(input);
  const ids = (kind: "transaction" | "card") =>
    items.filter((i) => i.kind === kind).map((i) => i.id);
  await prisma.$transaction([
    prisma.transaction.deleteMany({ where: { userId, id: { in: ids("transaction") } } }),
    prisma.cardPurchase.deleteMany({ where: { userId, id: { in: ids("card") } } }),
  ]);
  revalidatePath("/", "layout");
}
