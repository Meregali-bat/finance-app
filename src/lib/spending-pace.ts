import { cardBillDueFor, ownSpendingOf, storedDay } from "@/lib/period";

/**
 * "Se continuar gastando assim": o ritmo do dia a dia no ciclo até hoje,
 * levado até o fim dele. Puro e testado.
 *
 * O dia a dia é o mesmo do calendário de gastos — lançamentos e compras no
 * cartão —, sem contas fixas e faturas, que já estão na previsão. A compra
 * parcelada entra pela parcela: é o que ela pesa por mês, e uma TV em 10x não
 * diz que você gasta uma TV por ciclo.
 *
 * O que já saiu no ciclo também já está no "livre para gastar" (lançamentos
 * descontados, compras dentro das faturas), então a projeção só tira dele os
 * dias que ainda vêm. E o ritmo se divide como o dinheiro sai: o da conta sai
 * no dia; o de cada cartão, na fatura em que a compra cai — gastar no cartão
 * no fim de um ciclo só pesa no ciclo em que a fatura vence.
 */

const DAY = 86_400_000;

/** Antes disso, um almoço caro vira "R$ 90 por dia": cedo demais para projetar. */
export const MIN_PACE_DAYS = 3;

export interface SpendingPace {
  /** Quanto saiu no dia a dia, do início do ciclo até hoje. */
  spent: number;
  /** Dias do ciclo até hoje, hoje incluído. */
  elapsedDays: number;
  /** A média por dia, conta e cartão juntos. */
  perDay: number;
  /** A parte da média que sai da conta no dia. */
  accountPerDay: number;
  /** A parte de cada cartão, que sai na fatura. */
  cardPerDay: { cardId: string; perDay: number }[];
  /** Dias depois de hoje até o fim do ciclo. */
  remainingDays: number;
}

function cents(n: number) {
  return Math.round(n * 100) / 100;
}

export function spendingPace(input: {
  /** Início do ciclo, meia-noite local. */
  periodStart: Date;
  /** Dias até o fim contando hoje, como `PeriodForecast.daysLeft`. */
  daysLeft: number;
  today: Date;
  /** Saída positiva, receita negativa; datas em meia-noite UTC. */
  transactions: {
    amount: number;
    date: Date;
    fromPeriodClose?: boolean;
    transfer?: boolean;
    lent?: number;
  }[];
  cardPurchases: {
    cardId: string;
    amount: number;
    date: Date;
    installments?: number;
    lent?: number;
  }[];
}): SpendingPace | null {
  const start = input.periodStart.getTime();
  const todayStart = new Date(
    input.today.getFullYear(),
    input.today.getMonth(),
    input.today.getDate(),
  ).getTime();
  const elapsedDays = Math.round((todayStart - start) / DAY) + 1;
  if (elapsedDays < MIN_PACE_DAYS) return null;

  const inCycle = (date: Date) => {
    const t = storedDay(date).getTime();
    return t >= start && t <= todayStart;
  };
  // Só o gasto seu: sem transferência e sem a parte emprestada.
  const account = input.transactions
    .filter((t) => inCycle(t.date))
    .reduce((sum, t) => sum + ownSpendingOf(t), 0);
  const byCard = new Map<string, number>();
  for (const p of input.cardPurchases.filter((p) => inCycle(p.date))) {
    const parcel = ownSpendingOf(p) / Math.max(1, p.installments ?? 1);
    byCard.set(p.cardId, (byCard.get(p.cardId) ?? 0) + parcel);
  }
  const card = [...byCard.values()].reduce((sum, v) => sum + v, 0);
  const spent = cents(account + card);
  if (spent <= 0) return null;

  return {
    spent,
    elapsedDays,
    perDay: cents(spent / elapsedDays),
    // Sem arredondar: somadas de volta ao longo de muitos dias, as partes
    // arredondadas abririam centavos de diferença do total.
    accountPerDay: account / elapsedDays,
    cardPerDay: [...byCard].map(([cardId, total]) => ({ cardId, perDay: total / elapsedDays })),
    remainingDays: Math.max(0, input.daysLeft - 1),
  };
}

/**
 * O que o ritmo tira de cada ciclo, gastando todo dia de `from` até o fim do
 * último: a conta no ciclo do dia, cada cartão no ciclo em que vence a fatura
 * da compra. A fatura que vence depois do último ciclo fica de fora. Um cartão
 * que não está em `cards` (apagado) conta como a conta.
 */
export function paceSpendByCycle(
  pace: Pick<SpendingPace, "accountPerDay" | "cardPerDay">,
  periods: { periodStart: Date; periodEnd: Date }[],
  cards: { id: string; closingDay: number; dueDay: number }[],
  from: Date,
): number[] {
  const spend = periods.map(() => 0);
  if (periods.length === 0) return spend;
  const cycleOf = (day: Date) =>
    periods.findIndex(
      (p) => day.getTime() >= p.periodStart.getTime() && day.getTime() < p.periodEnd.getTime(),
    );
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const end = periods[periods.length - 1].periodEnd.getTime();
  for (
    let day = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    day.getTime() < end;
    day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
  ) {
    const today = cycleOf(day);
    if (today < 0) continue;
    spend[today] += pace.accountPerDay;
    for (const { cardId, perDay } of pace.cardPerDay) {
      const card = cardById.get(cardId);
      const k = card ? cycleOf(cardBillDueFor(day, card.closingDay, card.dueDay)) : today;
      if (k >= 0) spend[k] += perDay;
    }
  }
  return spend.map(cents);
}

/**
 * Com quanto cada ciclo fecha no ritmo (o índice é o offset), tirando de cada
 * um o que `paceSpendByCycle` pôs nele; o que sobra ou falta passa para o
 * próximo.
 *
 * A base de cada ciclo é o que a previsão já dá para ele: o livre, ou, num
 * ciclo que fecha no vermelho, a falta. A falta da previsão já chega sozinha
 * ao ciclo seguinte (está na herança dele), então só passa adiante o que o
 * ritmo mudou; a sobra, que a previsão supunha gasta, passa inteira.
 */
export function paceAcrossCycles(
  spendByCycle: number[],
  periods: { freeToSpend: number; endBalance: number }[],
): number[] {
  const base = (p: (typeof periods)[number]) =>
    p.endBalance < -0.005 ? p.endBalance : p.freeToSpend;
  const result: number[] = [];
  let carry = 0;
  periods.forEach((period, k) => {
    const left = cents(base(period) + carry - (spendByCycle[k] ?? 0));
    result.push(left);
    carry = cents(left - Math.min(0, base(period)));
  });
  return result;
}

export interface PaceWarning {
  /** O ciclo que fica no vermelho: 0 o atual, 1 o próximo. */
  offset: number;
  /** Com quanto ele fecha no ritmo: negativo. */
  left: number;
  /** O último dia dele. */
  lastDay: Date;
  /**
   * Quanto gastar por dia, de amanhã em diante, para nenhum ciclo até ele
   * fechar no vermelho. Nulo quando nem sem gastar nada fecha: aí são as
   * contas que não cabem, e um "segure em R$ X" mentiria.
   */
  perDayTarget: number | null;
}

/**
 * "Se continuar gastando assim, vai faltar": o primeiro ciclo, entre o atual e
 * o próximo, que fecha no vermelho no ritmo de hoje (o cartão no ciclo da
 * fatura, como na Previsão). O alvo escala o ritmo inteiro: gastar X por dia
 * tira de cada trecho `X / perDay` do que o ritmo tira, e fecha quando o que
 * sobra em cada trecho até o ciclo do aviso zera. É a mesma conta do card da
 * Previsão, para a Início e o aviso no celular dizerem o mesmo número.
 */
export function paceWarning(
  pace: Pick<SpendingPace, "perDay" | "accountPerDay" | "cardPerDay">,
  periods: { periodStart: Date; periodEnd: Date; freeToSpend: number; endBalance: number }[],
  cards: { id: string; closingDay: number; dueDay: number }[],
  from: Date,
): PaceWarning | null {
  const window = periods.slice(0, 2);
  if (window.length === 0 || pace.perDay <= 0) return null;
  const spend = paceSpendByCycle(pace, window, cards, from);
  const left = paceAcrossCycles(spend, window);
  const offset = left.findIndex((l) => l < -0.005);
  if (offset < 0) return null;

  const noSpend = paceAcrossCycles(
    window.map(() => 0),
    window,
  );
  const floorCents = (n: number) => Math.max(0, Math.floor(n * 100 + 1e-6) / 100);
  let perDayTarget: number | null = null;
  if (noSpend.slice(0, offset + 1).every((l) => l >= -0.005)) {
    let spent = 0;
    const targets: number[] = [];
    for (let k = 0; k <= offset; k++) {
      spent += spend[k];
      if (spent > 0.005) targets.push(floorCents(pace.perDay + (left[k] * pace.perDay) / spent));
    }
    perDayTarget = targets.length > 0 ? Math.min(...targets) : null;
  }
  const end = window[offset].periodEnd;
  return {
    offset,
    left: left[offset],
    lastDay: new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1),
    perDayTarget,
  };
}
