"use server";

import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";

/**
 * Guarda o tema num cookie, e não no navegador: o servidor o lê ao montar o
 * <html>, e a página já nasce com as cores certas, sem piscar o tema errado.
 */
export async function setTheme(theme: string) {
  const store = await cookies();
  store.set(THEME_COOKIE, parseTheme(theme), {
    path: "/",
    maxAge: 60 * 60 * 24 * 365 * 2,
    sameSite: "lax",
  });
}
