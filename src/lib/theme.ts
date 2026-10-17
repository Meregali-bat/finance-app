/** O tema escolhido. "system" segue o claro/escuro do aparelho. */
export type Theme = "light" | "dark" | "system";

export const THEME_COOKIE = "theme";

/** Sem escolha, o escuro de sempre. */
export const DEFAULT_THEME: Theme = "dark";

export function parseTheme(value: string | undefined): Theme {
  return value === "light" || value === "dark" || value === "system" ? value : DEFAULT_THEME;
}
