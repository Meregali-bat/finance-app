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
