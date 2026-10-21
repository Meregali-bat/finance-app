/**
 * O calendário de gastos: cada dia do período com o que saiu no dia a dia —
 * os lançamentos e as compras no cartão, no dia em que foram feitos. Contas
 * fixas e faturas ficam de fora: são o planejado, e pintariam o dia do
 * aluguel de vermelho todo mês sem dizer nada sobre como você gastou. Puro e
 * testado.
 */

export interface CalendarEntry {
  /** Um dia do calendário em meia-noite UTC, como lançamentos e compras guardam. */
  date: Date;
  amount: number;
  description: string;
  /** O cartão, quando foi compra no crédito. */
  cardName?: string;
}

export interface CalendarDay {
  /** "YYYY-MM-DD". */
  key: string;
  day: number;
  total: number;
  entries: CalendarEntry[];
  /** 0 (nada) a 4 (o dia mais pesado do período). */
  level: number;
  /** Ainda não aconteceu. */
  future: boolean;
}

export interface SpendingCalendar {
  /** Semanas de domingo a sábado; nulo é um dia fora do período. */
  weeks: (CalendarDay | null)[][];
  total: number;
  /** Quantos dias tiveram algum gasto. */
  activeDays: number;
  /** O dia que mais pesou. */
  peak: CalendarDay | null;
}

function keyOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * A intensidade do dia. Em raiz quadrada, não linear: um dia de R$ 2 mil não
 * pode apagar o resto do mês, que é onde o hábito aparece.
 */
function levelOf(total: number, max: number): number {
  if (total <= 0.005 || max <= 0) return 0;
  return Math.max(1, Math.min(4, Math.ceil(Math.sqrt(total / max) * 4)));
}

export function spendingCalendar(input: {
  /** O primeiro e o último dia do período, "YYYY-MM-DD", inclusivos. */
  firstDay: string;
  lastDay: string;
  /** "YYYY-MM-DD" de hoje. */
  today: string;
  entries: CalendarEntry[];
}): SpendingCalendar {
  const first = parseKey(input.firstDay);
  const last = parseKey(input.lastDay);

  const byKey = new Map<string, CalendarEntry[]>();
  for (const entry of input.entries) {
    if (entry.amount <= 0) continue;
    const key = keyOf(entry.date);
    if (key < input.firstDay || key > input.lastDay) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), entry]);
  }

  const days: CalendarDay[] = [];
  for (let d = first; d.getTime() <= last.getTime(); d = new Date(d.getTime() + 86_400_000)) {
    const key = keyOf(d);
    const entries = (byKey.get(key) ?? []).sort((a, b) => b.amount - a.amount);
    days.push({
      key,
      day: d.getUTCDate(),
      total: round(entries.reduce((sum, e) => sum + e.amount, 0)),
      entries,
      level: 0,
      future: key > input.today,
    });
  }

  const max = Math.max(0, ...days.map((d) => d.total));
  for (const day of days) day.level = levelOf(day.total, max);

  const weeks: (CalendarDay | null)[][] = [];
  let week: (CalendarDay | null)[] = Array(first.getUTCDay()).fill(null);
  for (const day of days) {
    week.push(day);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) weeks.push([...week, ...Array(7 - week.length).fill(null)]);

  const active = days.filter((d) => d.total > 0);
  return {
    weeks,
    total: round(active.reduce((sum, d) => sum + d.total, 0)),
    activeDays: active.length,
    peak: active.length > 0 ? active.reduce((a, b) => (b.total > a.total ? b : a)) : null,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
