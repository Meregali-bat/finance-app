"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";

const categorySchema = z.object({
  name: z.string().trim().min(1, "Informe um nome").max(80),
});

export async function createCategory(formData: FormData) {
  const userId = await requireUserId();
  const data = categorySchema.parse({ name: formData.get("name") });

  await prisma.category.create({ data: { ...data, userId } });
  revalidatePath("/rendas");
  revalidatePath("/historico");
}

export async function updateCategory(id: string, formData: FormData) {
  const userId = await requireUserId();
  const data = categorySchema.parse({ name: formData.get("name") });

  await prisma.category.update({ where: { id, userId }, data });
  revalidatePath("/rendas");
  revalidatePath("/historico");
}

export async function deleteCategory(id: string) {
  const userId = await requireUserId();
  await prisma.category.delete({ where: { id, userId } });
  revalidatePath("/rendas");
  revalidatePath("/historico");
}

export async function toggleCategoryActive(id: string, active: boolean) {
  const userId = await requireUserId();
  await prisma.category.update({ where: { id, userId }, data: { active } });
  revalidatePath("/rendas");
  revalidatePath("/historico");
}
