import { startOfWeek } from "date-fns";
import { formatDate } from "./format";

/** Como o período do relatório foi escolhido. */
export type RangeMode = "semana" | "mes" | "custom";

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
};

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

/** O intervalo é aberto no fim, então o rótulo mostra o último dia de dentro dele. */
function spanLabel(rangeStart: Date, rangeEnd: Date) {
  return `${formatDate(rangeStart)} – ${formatDate(addDays(rangeEnd, -1))}`;
}

function monthRange(year: number, monthIndex: number): ResolvedRange {
  return {
    mode: "mes",
    rangeStart: new Date(year, monthIndex, 1),
    rangeEnd: new Date(year, monthIndex + 1, 1),
    label: monthLabel(year, monthIndex),
    month: { year, monthIndex },
  };
}

/**
 * Traduz os parâmetros de URL num período concreto. Parâmetro faltando ou
 * inválido nunca é erro: o mês corrente é sempre a saída segura.
 */
export function resolveRange(params: RangeParams, today: Date = new Date()): ResolvedRange {
  const currentMonth = { year: today.getFullYear(), monthIndex: today.getMonth() };

  if (params.range === "semana") {
    const rangeStart = startOfWeek(today, { weekStartsOn: 1 });
    const rangeEnd = addDays(rangeStart, 7);
    return { mode: "semana", rangeStart, rangeEnd, label: spanLabel(rangeStart, rangeEnd), month: currentMonth };
  }

  if (params.range === "custom") {
    const from = parseDayParam(params.from);
    const to = parseDayParam(params.to);
    if (from && to) {
      // Datas trocadas descrevem o mesmo intervalo; corrigir é mais útil do que
      // devolver um período vazio.
      const [first, last] = from <= to ? [from, to] : [to, from];
      const rangeEnd = addDays(last, 1);
      return {
        mode: "custom",
        rangeStart: first,
        rangeEnd,
        label: spanLabel(first, rangeEnd),
        month: currentMonth,
      };
    }
    return monthRange(currentMonth.year, currentMonth.monthIndex);
  }

  const { year, monthIndex } = parseMonthParam(params.month, today);
  return monthRange(year, monthIndex);
}
