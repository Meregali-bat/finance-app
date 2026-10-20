"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { hashShortcutToken, newShortcutToken } from "@/lib/shortcut";

/**
 * Gera a chave do atalho e devolve ela — a única vez que ela aparece. Gerar de
 * novo troca a chave: o atalho com a antiga para de lançar.
 */
export async function generateShortcutToken(): Promise<string> {
  const userId = await requireUserId();
  const token = newShortcutToken();
  await prisma.user.update({
    where: { id: userId },
    data: { shortcutTokenHash: hashShortcutToken(token) },
  });
  revalidatePath("/cartoes");
  return token;
}

/** Desliga o lançamento automático: nenhuma chave vale mais. */
export async function revokeShortcutToken() {
  const userId = await requireUserId();
  await prisma.user.update({ where: { id: userId }, data: { shortcutTokenHash: null } });
  revalidatePath("/cartoes");
}
