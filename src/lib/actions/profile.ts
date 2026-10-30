"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { signOut } from "@/auth";
import { requireUserId } from "@/lib/auth-helpers";

/** O nome do perfil. Vazio apaga: o app volta a usar o email. */
export async function saveName(name: string) {
  const userId = await requireUserId();
  const value = z.string().max(60).parse(name).trim();
  await prisma.user.update({ where: { id: userId }, data: { name: value || null } });
  revalidatePath("/", "layout");
}

/**
 * A foto vem pronta do navegador: recortada em quadrado e reduzida para
 * 256px em JPEG, umas dezenas de KB. O limite aqui só barra o que não passou
 * por lá. Nulo tira a foto.
 */
const avatarSchema = z
  .string()
  .max(200_000)
  .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/)
  .nullable();

export async function saveAvatar(dataUrl: string | null) {
  const userId = await requireUserId();
  const avatar = avatarSchema.parse(dataUrl);
  await prisma.user.update({ where: { id: userId }, data: { avatar } });
  revalidatePath("/", "layout");
}

export async function logout() {
  await signOut({ redirectTo: "/login" });
}
