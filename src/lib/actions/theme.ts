"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PALETTE_COOKIE, THEME_COOKIE, parsePalette, parseTheme } from "@/lib/theme";

const COOKIE_OPTIONS = { path: "/", maxAge: 60 * 60 * 24 * 365 * 2, sameSite: "lax" } as const;

/**
 * Guarda o modo na conta e num cookie. A conta leva a escolha para os outros
 * aparelhos; o cookie deixa a tela de entrar com as mesmas cores. O servidor
 * lê os dois ao montar o <html>, e a página já nasce com as cores certas.
 */
export async function setTheme(theme: string) {
  const value = parseTheme(theme);
  (await cookies()).set(THEME_COOKIE, value, COOKIE_OPTIONS);
  const userId = (await auth())?.user?.id;
  if (userId) await prisma.user.update({ where: { id: userId }, data: { theme: value } });
  revalidatePath("/", "layout");
}

/** O mesmo, para a paleta de cores. */
export async function setPalette(palette: string) {
  const value = parsePalette(palette);
  (await cookies()).set(PALETTE_COOKIE, value, COOKIE_OPTIONS);
  const userId = (await auth())?.user?.id;
  if (userId) await prisma.user.update({ where: { id: userId }, data: { palette: value } });
  revalidatePath("/", "layout");
}
