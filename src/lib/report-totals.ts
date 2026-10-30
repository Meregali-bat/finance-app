import type { HistoryItem } from "./history-item";
import { storedDay } from "./period";

export type ReportTotals = {
  /** Só o que é seu: sem a parte emprestada e sem transferências. */
  spent: number;
  /** Renda: sem devoluções de empréstimo e sem dinheiro vindo de outra conta. Positivo. */
  received: number;
  /** A parte das despesas que é de outros (empréstimos). Saiu, mas volta. */
  lent: number;
  /** O que pessoas devolveram de empréstimos. Entrou, mas não é renda. */
  repaid: number;
  /** Para outras contas suas, menos o que veio delas. Positivo = saiu. */
  transferred: number;
  /** Guardado em caixinhas menos o resgatado. Não é gasto, mas saiu do disponível. */
  saved: number;
  /**
   * O quanto a conta mudou no período: `received + repaid − spent − lent −
   * saved − transferred`. É o movimento de caixa, não o resultado.
   */
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
 * A fatura de cartão paga também sai — as linhas dela (parcelas, assinaturas,
 * previsões e a diferença do pagamento) já contam uma a uma, e somar a fatura
 * contaria o mesmo dinheiro duas vezes. A despesa fixa paga entra, porque não
 * aparece em nenhum outro lugar. A caixinha não é gasto: tem total próprio.
 *
 * A diferença da fatura entra com o sinal que tiver: um estorno reduz o gasto
 * daquele cartão, não vira receita.
 *
 * Exportada porque o "Por categoria" do Histórico precisa do mesmo critério.
 */
export function countsAsSpending(item: HistoryItem) {
  if (item.transfer) return false;
  if (item.kind === "cardBillAdjustment") return true;
  if (item.kind === "cardBillPayment" || item.kind === "jarDeposit") return false;
  return item.amount > 0;
}

/**
 * Quanto da linha é gasto seu: o valor menos a parte emprestada. Uma conta
 * dividida com a Ana conta só a sua metade — a dela volta, e somá-la fazia o
 * mês parecer mais caro do que foi.
 */
export function ownSpending(item: HistoryItem) {
  if (!countsAsSpending(item)) return 0;
  return item.amount - (item.lent ?? 0);
}

export function countsAsReceived(item: HistoryItem) {
  if (item.transfer || item.loanRepayment) return false;
  if (item.kind === "cardBillAdjustment" || item.kind === "jarDeposit") return false;
  return item.amount < 0;
}

/** Linha que só troca o dinheiro de lugar: caixinha, outra conta sua, devolução. */
export function movesMoneyOnly(item: HistoryItem) {
  return item.kind === "jarDeposit" || !!item.transfer || !!item.loanRepayment;
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

  const sum = (pick: (item: HistoryItem) => number) =>
    items.reduce((total, item) => total + pick(item), 0);
  const spent = sum(ownSpending);
  const lent = sum((item) => (countsAsSpending(item) ? (item.lent ?? 0) : 0));
  const received = sum((item) => (countsAsReceived(item) ? -item.amount : 0));
  const repaid = sum((item) => (item.loanRepayment && !item.transfer ? -item.amount : 0));
  const transferred = sum((item) => (item.transfer ? item.amount : 0));
  const saved = sum((item) => (item.kind === "jarDeposit" ? item.amount : 0));

  const days = elapsedDays(rangeStart, rangeEnd, today);

  return {
    spent,
    received,
    lent,
    repaid,
    transferred,
    saved,
    balance: received + repaid - spent - lent - saved - transferred,
    dailyAverage: days > 0 ? spent / days : 0,
  };
}

function dayOf(item: HistoryItem): Date {
  // Lançamento guarda um dia de calendário em meia-noite UTC; o resto
  // (pagamento, vencimento de fatura) é um instante local.
  return item.kind === "transaction" ? storedDay(item.date) : startOfDay(item.date);
}

/**
 * O gasto do período agrupado para o gráfico do Histórico: por dia, ou por mês
 * quando o período passa de dois meses — sessenta colunas finas não dizem
 * nada. Usa o mesmo critério de gasto dos totais, então as colunas somam
 * exatamente o "Gasto" do resumo.
 */
export function spendingBuckets(input: {
  items: HistoryItem[];
  rangeStart: Date;
  rangeEnd: Date;
}): { start: Date; total: number; unit: "day" | "month" }[] {
  const { items, rangeStart, rangeEnd } = input;
  const days = diffCalendarDays(rangeEnd, rangeStart);
  const unit = days > 62 ? "month" : "day";

  const buckets: { start: Date; total: number; unit: "day" | "month" }[] = [];
  for (
    let cursor = startOfDay(rangeStart);
    cursor.getTime() < rangeEnd.getTime();
    cursor =
      unit === "day"
        ? new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1)
        : new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  ) {
    buckets.push({ start: cursor, total: 0, unit });
  }

  for (const item of items.filter(countsAsSpending)) {
    const day = dayOf(item);
    const index = buckets.findLastIndex((b) => b.start.getTime() <= day.getTime());
    if (index >= 0 && day.getTime() < rangeEnd.getTime()) buckets[index].total += ownSpending(item);
  }
  return buckets;
}
