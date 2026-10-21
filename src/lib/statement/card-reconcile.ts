import { normalizeName } from "@/lib/shortcut";
import type { CardBillLine } from "@/lib/statement/sicoob-card";

/**
 * Conferir a fatura do cartão com o que o app tem nessa fatura. Puro; a
 * action em src/lib/actions/statement.ts monta as parcelas do app e grava.
 */

/** O que o app cobra nesta fatura: uma parcela de compra ou uma assinatura. */
export interface AppCharge {
  amount: number;
  /** O dia da compra, em dias desde a época; nulo numa assinatura. */
  day: number | null;
  /** Compra parcelada no app: casa pela parcela, sem olhar a data. */
  installments: number;
}

export interface CardBillMatch {
  line: CardBillLine;
  fingerprint: string;
  matched: boolean;
}

const cents = (n: number) => Math.round(n * 100);
const utcDay = (d: Date) => Math.floor(d.getTime() / 86_400_000);

/**
 * Cada linha da fatura procura no app uma cobrança de mesmo valor (um
 * centavo de folga: o banco e o app podem arredondar a parcela diferente). À
 * vista, a data da compra pode diferir em até 3 dias; parcelada ou
 * assinatura, a data não importa. Cada cobrança do app confere uma linha só.
 */
export function reconcileCardBill(
  lines: CardBillLine[],
  app: AppCharge[],
  cardId: string,
): CardBillMatch[] {
  const used = new Set<number>();
  const seen = new Map<string, number>();
  return lines.map((line) => {
    const day = utcDay(line.date);
    let best = -1;
    let bestGap = Infinity;
    app.forEach((charge, i) => {
      if (used.has(i) || Math.abs(cents(charge.amount) - cents(line.amount)) > 1) return;
      const datedCash = !line.installment && charge.installments <= 1 && charge.day !== null;
      const gap = datedCash ? Math.abs(charge.day! - day) : 0;
      if (datedCash && gap > 3) return;
      if (gap < bestGap) {
        best = i;
        bestGap = gap;
      }
    });
    if (best >= 0) used.add(best);

    const base = [
      "card",
      cardId,
      line.date.toISOString().slice(0, 10),
      cents(line.amount),
      normalizeName(line.description),
      line.installment ? `${line.installment.current}/${line.installment.total}` : "",
    ].join("|");
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return { line, fingerprint: `${base}|${n}`, matched: best >= 0 };
  });
}

const LOWER = new Set(["de", "da", "do", "das", "dos", "e"]);
function titleCase(text: string): string {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word, i) => (i > 0 && LOWER.has(word) ? word : word[0].toUpperCase() + word.slice(1)))
    .join(" ");
}

/**
 * A compra que "Adicionar" cria. À vista, a própria linha. Parcelada, só o
 * que falta a partir desta fatura: na parcela 5 de 8, uma compra de 4x da
 * parcela, datada no fechamento desta fatura — assim a primeira das 4 cai
 * aqui e as faturas antigas, já pagas, não mudam.
 */
export function purchaseFromLine(
  line: CardBillLine,
  cycleEnd: Date,
): { date: Date; amount: number; installments: number; description: string } {
  const name = titleCase(line.description) || "Compra no cartão";
  if (!line.installment) {
    return {
      date: line.date,
      amount: line.amount,
      installments: 1,
      description: name.slice(0, 120),
    };
  }
  const { current, total } = line.installment;
  const remaining = Math.max(1, total - current + 1);
  const label =
    remaining === 1 ? `parcela ${total} de ${total}` : `parcelas ${current} a ${total} de ${total}`;
  return {
    date: cycleEnd,
    amount: Math.round(line.amount * remaining * 100) / 100,
    installments: remaining,
    description: `${name} (${label})`.slice(0, 120),
  };
}
