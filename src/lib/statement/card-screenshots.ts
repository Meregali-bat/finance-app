import { normalizeName } from "@/lib/shortcut";

/**
 * Conferir o cartão pelas prints da tela "Lançamentos" do app do banco, com a
 * fatura ainda aberta (sem PDF). A IA lê as prints (read-screenshots.ts); aqui
 * fica o resto, puro: juntar as prints, deixar de fora o que não é compra e
 * conciliar com as compras do cartão no app.
 */

export type ShotStatus = "processado" | "pendente" | "negado" | "cancelado" | "desconhecido";

/** Uma linha como a IA leu: o mês e a hora da tela, sem o ano. */
export interface RawShotLine {
  description: string;
  day: number;
  /** 1 a 12. */
  month: number;
  /** "HH:MM". */
  time: string;
  amount: number;
  status: ShotStatus;
  /** Pagamento de fatura, estorno ou crédito: "outro". */
  kind: "compra" | "outro";
}

/** Uma compra das prints, já com a data completa. */
export interface ShotLine {
  fingerprint: string;
  /** "YYYY-MM-DD". */
  date: string;
  time: string;
  description: string;
  amount: number;
}

/** Uma compra do cartão no app. `amount` é o total, como no banco de dados. */
export interface AppPurchase {
  id: string;
  description: string;
  /** "YYYY-MM-DD". */
  date: string;
  amount: number;
  installments: number;
}

const COUNTED: ReadonlySet<ShotStatus> = new Set(["processado", "pendente"]);
const DAY = 86_400_000;
const cents = (n: number) => Math.round(n * 100);
const round2 = (n: number) => Math.round(n * 100) / 100;
const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00.000Z`) / DAY);
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * As prints se sobrepõem ao rolar a lista: a mesma linha (nome, dia, hora e
 * valor) vira uma só. Negadas, canceladas, as "Desconhecido" de R$ 0,00 e o
 * que não é compra ficam de fora, contadas em `skipped`. A tela não mostra o
 * ano: é o de hoje, e um mês depois do atual é do ano passado.
 */
export function prepareShotLines(
  raw: RawShotLine[],
  cardId: string,
  today: Date,
): { lines: ShotLine[]; skipped: number } {
  const seen = new Set<string>();
  const lines: ShotLine[] = [];
  let skipped = 0;
  for (const r of raw) {
    const name = normalizeName(r.description);
    const key = [name, r.day, r.month, r.time, cents(r.amount)].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    if (r.kind !== "compra" || !COUNTED.has(r.status) || r.amount <= 0) {
      skipped++;
      continue;
    }
    const year = today.getFullYear() - (r.month > today.getMonth() + 1 ? 1 : 0);
    const date = `${year}-${pad(r.month)}-${pad(r.day)}`;
    lines.push({
      fingerprint: ["shot", cardId, date, r.time, cents(r.amount), name].join("|"),
      date,
      time: r.time,
      description: r.description.trim(),
      amount: round2(r.amount),
    });
  }
  lines.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  return { lines, skipped };
}

/** O valor de uma compra do app que confere com a linha, ou nulo. Parcelada: o total ou a parcela. */
function comparedValue(line: ShotLine, purchase: AppPurchase): number | null {
  const candidates = [purchase.amount];
  if (purchase.installments > 1) candidates.push(purchase.amount / purchase.installments);
  return candidates.find((v) => Math.abs(cents(v) - cents(line.amount)) <= 1) ?? null;
}

/**
 * Cada linha procura a compra do app de mesmo valor (um centavo de folga)
 * com a data mais perto, até 3 dias. Cada compra confere uma linha só. O que
 * sobra do app só conta dentro do período das prints: antes da primeira print
 * a compra pode estar lá, só não foi fotografada.
 */
export function reconcileShots(lines: ShotLine[], app: AppPurchase[]) {
  const dates = lines.map((l) => l.date).sort();
  const period = { start: dates[0] ?? "", end: dates[dates.length - 1] ?? "" };
  const used = new Set<number>();
  const matched: { line: ShotLine; purchase: AppPurchase; value: number }[] = [];
  const onlyBank: ShotLine[] = [];
  for (const line of lines) {
    const day = dayNumber(line.date);
    let best = -1;
    let bestGap = Infinity;
    let bestValue = 0;
    app.forEach((purchase, i) => {
      if (used.has(i)) return;
      const value = comparedValue(line, purchase);
      const gap = Math.abs(dayNumber(purchase.date) - day);
      if (value === null || gap > 3 || gap >= bestGap) return;
      best = i;
      bestGap = gap;
      bestValue = value;
    });
    if (best < 0) {
      onlyBank.push(line);
      continue;
    }
    used.add(best);
    matched.push({ line, purchase: app[best], value: bestValue });
  }
  const onlyApp = app.filter(
    (p, i) => !used.has(i) && p.date >= period.start && p.date <= period.end,
  );
  return {
    period,
    matched: matched.map(({ line, purchase }) => ({ line, purchase })),
    onlyBank,
    onlyApp,
    bankTotal: round2(lines.reduce((sum, l) => sum + l.amount, 0)),
    appTotal: round2(
      matched.reduce((sum, m) => sum + m.value, 0) + onlyApp.reduce((sum, p) => sum + p.amount, 0),
    ),
  };
}

/**
 * O novo total da compra do app ao ligá-la a uma linha do banco. Parcelada,
 * o valor do banco é tratado como a parcela (decisão do usuário).
 */
export function linkedAmount(lineAmount: number, installments: number): number {
  return round2(lineAmount * Math.max(1, installments));
}

/** "Manter" uma compra do app que não está nas prints: lembrado em StatementIgnore. */
export function keepFingerprint(purchaseId: string): string {
  return `keep|${purchaseId}`;
}
