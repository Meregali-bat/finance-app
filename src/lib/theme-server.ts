import { cache } from "react";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  PALETTE_COOKIE,
  THEME_COOKIE,
  parsePalette,
  parseTheme,
  type Palette,
  type Theme,
} from "@/lib/theme";

/**
 * O modo e a paleta desta requisição. Com a pessoa logada, valem os da conta,
 * para o tema ser o mesmo em todo aparelho; sem login (a tela de entrar) ou
 * sem escolha salva na conta, vale o cookie do aparelho. Uma vez por
 * requisição: o layout, os metadados e a viewport pedem o mesmo.
 */
export const currentAppearance = cache(
  async (): Promise<{ theme: Theme; palette: Palette }> => {
    const store = await cookies();
    const fromCookie = {
      theme: store.get(THEME_COOKIE)?.value,
      palette: store.get(PALETTE_COOKIE)?.value,
    };
    const userId = (await auth())?.user?.id;
    const saved = userId
      ? await prisma.user.findUnique({
          where: { id: userId },
          select: { theme: true, palette: true },
        })
      : null;
    return {
      theme: parseTheme(saved?.theme ?? fromCookie.theme),
      palette: parsePalette(saved?.palette ?? fromCookie.palette),
    };
  },
);
