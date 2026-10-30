"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { Refusal, refusing } from "@/lib/action-result";

const categorySchema = z.object({
  name: z.string().trim().min(1, "Informe um nome").max(80),
});

export async function createCategory(formData: FormData) {
  return refusing(async () => {
    const userId = await requireUserId();
    const data = categorySchema.parse({ name: formData.get("name") });

    await prisma.category.create({ data: { ...data, userId } });
    revalidatePath("/rendas");
    revalidatePath("/historico");
  });
}

export async function updateCategory(id: string, formData: FormData) {
  return refusing(async () => {
    const userId = await requireUserId();
    const data = categorySchema.parse({ name: formData.get("name") });

    await prisma.category.update({ where: { id, userId }, data });
    revalidatePath("/rendas");
    revalidatePath("/historico");
  });
}

/** Só a categoria sem uso se exclui: em uso, o histórico perderia a dela. */
export async function deleteCategory(id: string) {
  return refusing(async () => {
    const userId = await requireUserId();
    const category = await prisma.category.findFirst({
      where: { id, userId },
      include: { _count: { select: { transactions: true, cardPurchases: true, fixedExpenses: true } } },
    });
    if (!category) return;
    const { transactions, cardPurchases, fixedExpenses } = category._count;
    if (transactions + cardPurchases + fixedExpenses > 0) {
      throw new Refusal("Esta categoria está em uso. Desative-a em vez de excluir.");
    }
    await prisma.category.delete({ where: { id: category.id } });
    revalidatePath("/rendas");
    revalidatePath("/historico");
  });
}

export async function toggleCategoryActive(id: string, active: boolean) {
  const userId = await requireUserId();
  await prisma.category.update({ where: { id, userId }, data: { active } });
  revalidatePath("/rendas");
  revalidatePath("/historico");
}
