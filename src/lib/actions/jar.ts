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

export async function deleteJar(id: string) {
  const userId = await requireUserId();
  await prisma.jar.delete({ where: { id, userId } });
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
