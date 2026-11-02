import type { BudgetInputs } from "@/lib/budget-inputs";
import type { PeriodForecast } from "@/lib/forecast";
import { paceWarning, spendingPace, type PaceWarning } from "@/lib/spending-pace";

/** O dia do ciclo em que o aviso do ritmo vai para o celular. */
export const PACE_ALERT_DAY = 10;

/**
 * O aviso "no ritmo atual, vai faltar" com o que a Início e o aviso no celular
 * precisam: o ritmo de agora, o ciclo que fica no vermelho e o alvo por dia.
 * `periods` são o ciclo corrente e o seguinte da previsão (`todayBudget`).
 */
export function paceWarningFor(
  inputs: BudgetInputs,
  periods: PeriodForecast[],
  today: Date,
  /** O número do dia: o alvo nunca passa dele. */
  dailyAvailable = Infinity,
): (PaceWarning & { elapsedDays: number; periodStart: Date; perDay: number }) | null {
  const current = periods[0];
  if (!current) return null;
  const pace = spendingPace({
    periodStart: current.periodStart,
    daysLeft: current.daysLeft,
    today,
    transactions: inputs.transactions,
    cardPurchases: inputs.cardPurchases,
  });
  if (!pace) return null;
  const cards = inputs.creditCards.map((c) => ({
    id: c.id,
    closingDay: c.closingDay,
    dueDay: c.dueDay,
  }));
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const warning = paceWarning(pace, periods, cards, tomorrow, dailyAvailable);
  return (
    warning && {
      ...warning,
      elapsedDays: pace.elapsedDays,
      periodStart: current.periodStart,
      perDay: pace.perDay,
    }
  );
}
