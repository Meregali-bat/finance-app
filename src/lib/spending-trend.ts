import { ownSpendingOf, storedDay } from "./period";

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
}

/**
 * O gasto do dia a dia acumulado, um ponto por dia, de `start` até `today`.
 *
 * Entra o que é gasto variável: lançamentos de saída (valor positivo) e
 * compras no cartão, cada um no dia em que aconteceu — a data de calendário
 * gravada, lida por `storedDay`. Entradas, contas fixas e faturas ficam de
 * fora: elas já estão no orçamento como compromisso, e este número responde
 * "quanto eu já gastei por escolha neste período". Pelo mesmo motivo saem a
 * transferência para outra conta sua e a parte emprestada.
 */
export function cumulativeDailySpending(input: {
  start: Date;
  today: Date;
  transactions: { amount: number; date: Date; transfer?: boolean; lent?: number }[];
  cardPurchases: { amount: number; date: Date; lent?: number }[];
}): { day: Date; total: number }[] {
  const { start, today } = input;
  const days = Math.max(1, daysBetween(start, today) + 1);
  const byDay = new Array<number>(days).fill(0);

  const add = (date: Date, amount: number) => {
    const index = daysBetween(start, storedDay(date));
    if (index >= 0 && index < days) byDay[index] += amount;
  };
  input.transactions.forEach((t) => add(t.date, ownSpendingOf(t)));
  input.cardPurchases.forEach((p) => add(p.date, ownSpendingOf(p)));

  return byDay.reduce<{ day: Date; total: number }[]>((points, amount, index) => {
    const previous = points.at(-1)?.total ?? 0;
    points.push({
      day: new Date(start.getFullYear(), start.getMonth(), start.getDate() + index),
      total: previous + amount,
    });
    return points;
  }, []);
}
