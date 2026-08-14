import type { HistoryItem } from "./history-item";

export type ReportTotals = {
  spent: number;
  /** Positivo, ao contrário do sinal que a receita tem no banco. */
  received: number;
  balance: number;
  dailyAverage: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function diffCalendarDays(a: Date, b: Date) {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / MS_PER_DAY);
}

/**
 * A receita fica de fora do gasto: ela é negativa no banco e, somada junto,
 * cancelaria parte do total.
 *
 * A fatura de cartão paga também sai — as compras dela já contam uma a uma, e
 * somar a fatura contaria o mesmo dinheiro duas vezes. A despesa fixa paga
 * entra, porque não aparece em nenhum outro lugar.
 */
function countsAsSpending(item: HistoryItem) {
  return item.amount > 0 && item.kind !== "cardBillPayment";
}

/**
 * Quantos dias do período já aconteceram. Um período em curso conta só até
 * hoje: dividir pelos 31 dias de um mês no dia 5 faria o gasto parecer seis
 * vezes menor do que o ritmo real.
 */
function elapsedDays(rangeStart: Date, rangeEnd: Date, today: Date) {
  const totalDays = diffCalendarDays(rangeEnd, rangeStart);
  if (today.getTime() >= rangeEnd.getTime()) return totalDays;
  return Math.max(0, diffCalendarDays(today, rangeStart) + 1);
}

/**
 * Os números do resumo do período. `items` já vem restrito a
 * [rangeStart, rangeEnd) — as datas servem para saber por quantos dias dividir.
 */
export function calculateReportTotals(input: {
  items: HistoryItem[];
  rangeStart: Date;
  rangeEnd: Date;
  today: Date;
}): ReportTotals {
  const { items, rangeStart, rangeEnd, today } = input;

  const spent = items.filter(countsAsSpending).reduce((sum, item) => sum + item.amount, 0);
  const received = items
    .filter((item) => item.amount < 0)
    .reduce((sum, item) => sum - item.amount, 0);

  const days = elapsedDays(rangeStart, rangeEnd, today);

  return {
    spent,
    received,
    balance: received - spent,
    dailyAverage: days > 0 ? spent / days : 0,
  };
}
