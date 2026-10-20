/** O idioma do passo a passo do atalho: o dos menus do iPhone. */
export type ShortcutLanguage = "pt" | "en";

/**
 * O idioma preferido do aparelho, lido do `Accept-Language` que o navegador
 * manda. Português em qualquer variante fica em português; inglês, se vier
 * antes de qualquer português; qualquer outro idioma cai no português do app.
 */
export function shortcutLanguage(acceptLanguage: string | null): ShortcutLanguage {
  if (!acceptLanguage) return "pt";
  const tags = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q.trim().slice(2)) : 1 };
    })
    .filter((entry) => entry.tag && Number.isFinite(entry.q) && entry.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of tags) {
    if (tag === "pt" || tag.startsWith("pt-")) return "pt";
    if (tag === "en" || tag.startsWith("en-")) return "en";
  }
  return "pt";
}
