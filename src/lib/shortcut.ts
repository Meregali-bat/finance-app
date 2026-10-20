import { createHash, randomBytes } from "node:crypto";

/**
 * O lançamento que chega do atalho do iPhone (automação "Transação" do app
 * Atalhos): valor, loja e cartão, do jeito que a Carteira entrega. Tudo aqui é
 * puro; a rota em src/app/api/atalho grava.
 */

/** Uma chave nova: 32 bytes aleatórios, em base64url, com prefixo legível. */
export function newShortcutToken(): string {
  return `fin_${randomBytes(32).toString("base64url")}`;
}

/** O que fica no banco: só o hash. A chave em si aparece uma vez, ao gerar. */
export function hashShortcutToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

/**
 * O valor como o atalho manda. A Carteira entrega um número, mas dentro do
 * JSON do Atalhos ele pode virar texto formatado no idioma do iPhone:
 * "R$ 12,50", "1.234,56", "12.50", "-R$ 12,50". O sinal é ignorado — é sempre
 * um gasto. Nulo quando não há número que preste.
 */
export function parseShortcutAmount(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) && raw !== 0 ? Math.abs(raw) : null;
  if (typeof raw !== "string") return null;
  let s = raw.replace(/[^\d.,]/g, "");
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    // Os dois aparecem: o último é o decimal, o outro separa milhar.
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    // Só vírgula: o decimal do pt-BR ("12,50").
    s = s.replace(/,/g, ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // Só ponto, em grupos de três: milhar do pt-BR ("1.234"). Fora isso o
    // ponto é decimal ("12.50", de um iPhone em inglês ou do número cru).
    s = s.replace(/\./g, "");
  }
  const value = Number(s);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

/** Minúsculas, sem acento e sem pontuação: "Nubank Ultravioleta" ~ "nubank". */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Qual cartão do app é o da Carteira. O nome na Carteira costuma ser o do
 * banco mais o produto ("Nubank Ultravioleta", "Sicoob Mastercard Black"), e o
 * do app, o que a pessoa digitou ("Nubank"). Casa quando um contém o outro;
 * havendo mais de um, fica o nome mais longo — o mais específico. Nenhum
 * casando, nulo: o gasto entra como saída da conta, em vez de no cartão errado.
 */
export function matchCard<T extends { name: string }>(walletName: unknown, cards: T[]): T | null {
  if (typeof walletName !== "string") return null;
  const wallet = normalizeName(walletName);
  if (!wallet) return null;
  const padded = ` ${wallet} `;
  const hits = cards.filter((card) => {
    const name = normalizeName(card.name);
    return name !== "" && (padded.includes(` ${name} `) || ` ${name} `.includes(padded));
  });
  if (hits.length === 0) return null;
  return hits.reduce((best, card) =>
    normalizeName(card.name).length > normalizeName(best.name).length ? card : best,
  );
}

/** A loja vira a descrição; sem loja, um nome que ainda diz de onde veio. */
export function shortcutDescription(merchant: unknown, cardName: string | null): string {
  const text = typeof merchant === "string" ? merchant.trim().replace(/\s+/g, " ") : "";
  if (text) return text.slice(0, 120);
  return cardName ? `Compra no ${cardName}` : "Compra por aproximação";
}

/** O dia de hoje no fuso do processo, gravado como meia-noite UTC — como os formulários. */
export function calendarToday(now: Date): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/**
 * O nome do cartão como texto, seja lá como o Atalhos mandou: texto, número
 * ou, se a variável foi sem conversão, um objeto. Vazio vira nulo.
 */
export function walletCardText(raw: unknown): string | null {
  let text: string;
  if (typeof raw === "string") text = raw;
  else if (typeof raw === "number" || typeof raw === "boolean") text = String(raw);
  else if (raw && typeof raw === "object") text = JSON.stringify(raw);
  else return null;
  text = text.trim().replace(/\s+/g, " ");
  return text ? text.slice(0, 80) : null;
}
