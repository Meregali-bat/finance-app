import { storedDay } from "@/lib/period";

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
 * dias que ainda vêm: o ritmo vezes os dias depois de hoje.
 */

const DAY = 86_400_000;

/** Antes disso, um almoço caro vira "R$ 90 por dia": cedo demais para projetar. */
export const MIN_PACE_DAYS = 3;

export interface SpendingPace {
  /** Quanto saiu no dia a dia, do início do ciclo até hoje. */
  spent: number;
  /** Dias do ciclo até hoje, hoje incluído. */
  elapsedDays: number;
  /** A média por dia. */
  perDay: number;
  /** Dias depois de hoje até o fim do ciclo. */
  remainingDays: number;
  /** O que ainda sairia nesse ritmo. */
  projectedSpending: number;
  /** O livre para gastar menos o que ainda sairia: negativo = vai faltar. */
  projectedLeft: number;
  /** Num ciclo que vai faltar, quanto a menos por dia fecha a conta. */
  cutPerDay: number;
}

function cents(n: number) {
  return Math.round(n * 100) / 100;
}

export function spendingPace(input: {
  /** Início do ciclo, meia-noite local. */
  periodStart: Date;
  /** Dias até o fim contando hoje, como `PeriodForecast.daysLeft`. */
  daysLeft: number;
  freeToSpend: number;
  today: Date;
  /** Saída positiva, receita negativa; datas em meia-noite UTC. */
  transactions: { amount: number; date: Date; fromPeriodClose?: boolean }[];
  cardPurchases: { amount: number; date: Date; installments?: number }[];
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
  const spent = cents(
    input.transactions
      .filter((t) => t.amount > 0 && !t.fromPeriodClose && inCycle(t.date))
      .reduce((sum, t) => sum + t.amount, 0) +
      input.cardPurchases
        .filter((p) => inCycle(p.date))
        .reduce((sum, p) => sum + p.amount / Math.max(1, p.installments ?? 1), 0),
  );
  if (spent <= 0) return null;

  const perDay = cents(spent / elapsedDays);
  const remainingDays = Math.max(0, input.daysLeft - 1);
  const projectedSpending = cents((spent / elapsedDays) * remainingDays);
  const projectedLeft = cents(input.freeToSpend - projectedSpending);
  const cutPerDay =
    projectedLeft < 0 && remainingDays > 0 ? cents(-projectedLeft / remainingDays) : 0;
  return {
    spent,
    elapsedDays,
    perDay,
    remainingDays,
    projectedSpending,
    projectedLeft,
    cutPerDay,
  };
}

/**
 * O mesmo ritmo levado aos ciclos seguintes: cada um gasta `perDay` todos os
 * dias, e o que sobra ou falta passa para o próximo. Devolve, por ciclo (o
 * índice é o offset), com quanto ele fecha.
 *
 * A base de cada ciclo é o que a previsão já dá para ele: o livre, ou, num
 * ciclo que fecha no vermelho, a falta. A falta da previsão já chega sozinha
 * ao ciclo seguinte (está na herança dele), então só passa adiante o que o
 * ritmo mudou; a sobra, que a previsão supunha gasta, passa inteira.
 */
export function paceAcrossCycles(
  pace: Pick<SpendingPace, "perDay" | "projectedLeft">,
  periods: { offset: number; totalDays: number; freeToSpend: number; endBalance: number }[],
): number[] {
  const base = (p: (typeof periods)[number]) =>
    p.endBalance < -0.005 ? p.endBalance : p.freeToSpend;
  const result: number[] = [];
  let carry = 0;
  for (const period of periods) {
    const left =
      period.offset === 0
        ? pace.projectedLeft
        : cents(base(period) + carry - pace.perDay * period.totalDays);
    result.push(left);
    carry = cents(left - Math.min(0, base(period)));
  }
  return result;
}
