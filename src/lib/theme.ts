/** O tema escolhido. "system" segue o claro/escuro do aparelho. */
export type Theme = "light" | "dark" | "system";

export const THEME_COOKIE = "theme";

/** Sem escolha, o escuro de sempre. */
export const DEFAULT_THEME: Theme = "dark";

export function parseTheme(value: string | null | undefined): Theme {
  return value === "light" || value === "dark" || value === "system" ? value : DEFAULT_THEME;
}

/**
 * A paleta: a cor do app, que vale nos dois modos. "wine" é a de sempre; as
 * outras redefinem os mesmos tokens em `src/app/palettes.css`.
 */
export type Palette = "wine" | "ocean" | "forest" | "graphite" | "plum";

export const PALETTE_COOKIE = "palette";

export const DEFAULT_PALETTE: Palette = "wine";

export const PALETTES: {
  value: Palette;
  label: string;
  /** O fundo de cada modo: a cor da barra do navegador e da prévia no Perfil. */
  background: { dark: string; light: string };
  /** A cor da marca (botão principal) e o destaque de texto, só para a prévia. */
  brand: string;
  accent: { dark: string; light: string };
}[] = [
  {
    value: "wine",
    label: "Vinho",
    background: { dark: "#0c0706", light: "#fbf7f5" },
    brand: "#6b0504",
    accent: { dark: "#f2a99f", light: "#9b2a20" },
  },
  {
    value: "ocean",
    label: "Oceano",
    background: { dark: "#05090c", light: "#f5f8fa" },
    brand: "#064a70",
    accent: { dark: "#8fc6ea", light: "#1f5f8b" },
  },
  {
    value: "forest",
    label: "Floresta",
    background: { dark: "#060a07", light: "#f6f9f5" },
    brand: "#115225",
    accent: { dark: "#a6d6a0", light: "#2e6b2a" },
  },
  {
    value: "graphite",
    label: "Grafite",
    background: { dark: "#09090a", light: "#f7f7f6" },
    brand: "#7a4f10",
    accent: { dark: "#f0c27a", light: "#8a5a0e" },
  },
  {
    value: "plum",
    label: "Ameixa",
    background: { dark: "#0b070c", light: "#faf7fb" },
    brand: "#581466",
    accent: { dark: "#d9a8ec", light: "#7a2d93" },
  },
];

export function parsePalette(value: string | null | undefined): Palette {
  return PALETTES.some((p) => p.value === value) ? (value as Palette) : DEFAULT_PALETTE;
}

export function paletteInfo(palette: Palette) {
  return PALETTES.find((p) => p.value === palette) ?? PALETTES[0];
}
