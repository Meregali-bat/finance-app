import { startOfWeek } from "date-fns";
import { formatDate } from "./format";

/** Como o período do relatório foi escolhido. */
export type RangeMode = "hoje" | "semana" | "mes" | "custom";

/** Os parâmetros de URL que descrevem o período — todos opcionais e não confiáveis. */
export type RangeParams = {
  range?: string;
  month?: string;
  from?: string;
  to?: string;
};

export type ResolvedRange = {
  mode: RangeMode;
  rangeStart: Date;
  /** Exclusivo: o primeiro instante fora do período. */
  rangeEnd: Date;
  label: string;
  /** O mês que as setas de navegação usam como referência. */
  month: { year: number; monthIndex: number };
  /**
   * Os mesmos dias do calendário, mas com as bordas em meia-noite UTC.
   *
   * `Transaction.date` e `CardPurchase.date` guardam um dia do calendário como
   * meia-noite UTC (ver o comentário em src/lib/format.ts). Comparados com as
   * bordas locais acima, num fuso negativo eles caem no período anterior: um
   * lançamento do dia 16 é `16/08 00:00Z`, que é anterior a `16/08 00:00-03:00`
   * e portanto entra no dia 15. `paidAt` e `occurrenceDate` não têm esse
   * problema e continuam usando as bordas locais.
   */
  utcRangeStart: Date;
  utcRangeEnd: Date;
  /**
   * Os períodos vizinhos, já resolvidos aqui — e é por isso que eles são
   * dados, e não uma função que o componente chama.
   *
   * A conta de calendário usa `getFullYear/getMonth/getDate`, que leem a data
   * no fuso de quem chama. Refeita no navegador sobre uma `Date` que veio
   * daqui, ela dá outro dia: em produção o servidor roda em UTC e o aparelho
   * não, então o servidor renderiza a seta para o dia 16 e o cliente rehidrata
   * ela apontando para o 15. Um toque andava dois dias, e para frente caía na
   * própria página. No `localhost` os dois fusos coincidem e nada aparece.
   */
  previous: RangeParams;
  next: RangeParams;
  /** As pontas como "YYYY-MM-DD", pelo mesmo motivo: `dayParam` também lê no fuso. */
  firstDay: string;
  lastDay: string;
};

/** O período antes de ganhar tudo que é derivado dele. */
type RangeCore = Omit<
  ResolvedRange,
  "utcRangeStart" | "utcRangeEnd" | "previous" | "next" | "firstDay" | "lastDay"
>;

/** A meia-noite UTC do mesmo dia do calendário. */
function utcMidnight(day: Date) {
  return new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()));
}

/**
 * Completa o período com tudo que depende de conta de calendário. Roda uma vez
 * só, onde `resolveRange` roda — no servidor — para que o resultado atravesse
 * a serialização como string e número, que não têm fuso.
 */
function complete(core: RangeCore): ResolvedRange {
  return {
    ...core,
    utcRangeStart: utcMidnight(core.rangeStart),
    utcRangeEnd: utcMidnight(core.rangeEnd),
    previous: shiftRange(core, -1),
    next: shiftRange(core, 1),
    firstDay: dayParam(core.rangeStart),
    // O fim é exclusivo: o último dia de dentro é o anterior a ele.
    lastDay: dayParam(addDays(core.rangeEnd, -1)),
  };
}

export function monthParam(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

export function monthLabel(year: number, monthIndex: number) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    new Date(year, monthIndex, 1),
  );
}

/** "YYYY-MM-DD" como meia-noite local, ou null se não for uma data de calendário. */
function parseDayParam(day: string | undefined): Date | null {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const [year, month, dayOfMonth] = day.split("-").map(Number);
  const date = new Date(year, month - 1, dayOfMonth);
  // Descarta "2026-02-31" e afins, que o construtor silenciosamente empurraria
  // para o mês seguinte.
  if (date.getMonth() !== month - 1 || date.getDate() !== dayOfMonth) return null;
  return date;
}

function parseMonthParam(
  month: string | undefined,
  today: Date,
): { year: number; monthIndex: number } {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [year, m] = month.split("-").map(Number);
    if (m >= 1 && m <= 12) return { year, monthIndex: m - 1 };
  }
  return { year: today.getFullYear(), monthIndex: today.getMonth() };
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Meia-noite local — descarta a hora que `new Date()` traz junto. */
function startOfDay(date: Date) {
  return addDays(date, 0);
}

/** "YYYY-MM-DD" no fuso local, do jeito que o `<input type="date">` espera. */
export function dayParam(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function countDays(rangeStart: Date, rangeEnd: Date) {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((rangeEnd.getTime() - rangeStart.getTime()) / MS_PER_DAY);
}

/** O intervalo é aberto no fim, então o rótulo mostra o último dia de dentro dele. */
function spanLabel(rangeStart: Date, rangeEnd: Date) {
  return `${formatDate(rangeStart)} – ${formatDate(addDays(rangeEnd, -1))}`;
}

/** "Hoje" só enquanto for hoje: navegado para outro dia, o rótulo vira a data. */
function dayLabel(day: Date, today: Date) {
  return day.getTime() === startOfDay(today).getTime() ? "Hoje" : formatDate(day);
}

function monthRange(year: number, monthIndex: number): ResolvedRange {
  return complete({
    mode: "mes",
    rangeStart: new Date(year, monthIndex, 1),
    rangeEnd: new Date(year, monthIndex + 1, 1),
    label: monthLabel(year, monthIndex),
    month: { year, monthIndex },
  });
}

/**
 * Traduz os parâmetros de URL num período concreto. Parâmetro faltando ou
 * inválido nunca é erro: o mês corrente é sempre a saída segura.
 */
export function resolveRange(params: RangeParams, today: Date = new Date()): ResolvedRange {
  const currentMonth = { year: today.getFullYear(), monthIndex: today.getMonth() };

  if (params.range === "hoje") {
    // `from` é só a âncora, como na semana: sem ela, é o dia de hoje.
    const rangeStart = startOfDay(parseDayParam(params.from) ?? today);
    const rangeEnd = addDays(rangeStart, 1);
    return complete({
      mode: "hoje",
      rangeStart,
      rangeEnd,
      label: dayLabel(rangeStart, today),
      month: currentMonth,
    });
  }

  if (params.range === "semana") {
    // `from` é só a âncora: qualquer dia dentro da semana desejada serve, e a
    // semana continua abrindo na segunda-feira. Sem âncora, é a de hoje.
    const rangeStart = startOfWeek(parseDayParam(params.from) ?? today, { weekStartsOn: 1 });
    const rangeEnd = addDays(rangeStart, 7);
    return complete({
      mode: "semana",
      rangeStart,
      rangeEnd,
      label: spanLabel(rangeStart, rangeEnd),
      month: currentMonth,
    });
  }

  if (params.range === "custom") {
    const from = parseDayParam(params.from);
    const to = parseDayParam(params.to);
    if (from && to) {
      // Datas trocadas descrevem o mesmo intervalo; corrigir é mais útil do que
      // devolver um período vazio.
      const [first, last] = from <= to ? [from, to] : [to, from];
      const rangeEnd = addDays(last, 1);
      return complete({
        mode: "custom",
        rangeStart: first,
        rangeEnd,
        label: spanLabel(first, rangeEnd),
        month: currentMonth,
      });
    }
    return monthRange(currentMonth.year, currentMonth.monthIndex);
  }

  const { year, monthIndex } = parseMonthParam(params.month, today);
  return monthRange(year, monthIndex);
}

/**
 * O período vizinho, na unidade do modo atual: o dia anda de um em um, o mês
 * de mês em mês, a semana de sete em sete dias, e o intervalo personalizado
 * pela própria duração. Devolve parâmetros, não datas — quem navega é a URL.
 */
function shiftRange(range: RangeCore, direction: 1 | -1): RangeParams {
  if (range.mode === "hoje") {
    return { range: "hoje", from: dayParam(addDays(range.rangeStart, direction)) };
  }

  if (range.mode === "semana") {
    return { range: "semana", from: dayParam(addDays(range.rangeStart, direction * 7)) };
  }

  if (range.mode === "custom") {
    const days = countDays(range.rangeStart, range.rangeEnd);
    const first = addDays(range.rangeStart, direction * days);
    return { range: "custom", from: dayParam(first), to: dayParam(addDays(first, days - 1)) };
  }

  const { year, monthIndex } = range.month;
  const total = year * 12 + monthIndex + direction;
  return { range: "mes", month: monthParam(Math.floor(total / 12), ((total % 12) + 12) % 12) };
}

// Leitura do que `resolveRange` já calculou, nunca uma conta nova: refazer a
// conta é justamente o que quebrava a navegação no celular.
export function previousRangeParams(range: ResolvedRange): RangeParams {
  return range.previous;
}

export function nextRangeParams(range: ResolvedRange): RangeParams {
  return range.next;
}

/** A query relativa que leva a um período — o Link resolve contra a rota atual. */
export function rangeHref(params: RangeParams): string {
  const query = new URLSearchParams();
  for (const key of ["range", "month", "from", "to"] as const) {
    const value = params[key];
    if (value) query.set(key, value);
  }
  return `?${query.toString()}`;
}
