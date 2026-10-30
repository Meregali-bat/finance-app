import { addDays, isSameDay, startOfDay } from "date-fns";
import { fallsOnDay, obligationsInRange, openOccurrenceAmounts, ownSpendingOf } from "@/lib/period";
import { todayBudget } from "@/lib/today-budget";
import type { BudgetInputs } from "@/lib/budget-inputs";
import { formatCurrency, formatDate } from "@/lib/format";

/**
 * Os avisos no celular, decididos aqui e mandados por src/lib/push.ts. Só
 * existe aviso quando há algo a fazer ou a saber — nunca um "está tudo bem".
 */
export interface Alert {
  title: string;
  body: string;
  /** Para onde o toque no aviso leva. */
  url: string;
  /** Um aviso com a mesma tag substitui o anterior em vez de empilhar. */
  tag: string;
}

/**
 * Os avisos da manhã: conta fixa que vence amanhã, fatura que vence hoje,
 * fatura que fecha hoje e renda prevista para hoje ainda não confirmada.
 */
export function dailyAlerts(inputs: BudgetInputs, today: Date): Alert[] {
  const day = startOfDay(today);
  const tomorrow = addDays(day, 1);
  const alerts: Alert[] = [];
  const input = { ...inputs, today };

  const dueTomorrow = obligationsInRange(input, tomorrow, addDays(tomorrow, 1));
  for (const occ of dueTomorrow.fixedExpenseOccurrences) {
    if (occ.payment) continue;
    const { remaining } = openOccurrenceAmounts(occ.estimate, occ.partial);
    if (remaining < 0.005) continue;
    const label = inputs.fixedExpenses.find((e) => e.id === occ.expenseId)?.label ?? "Conta fixa";
    alerts.push({
      title: `${label} vence amanhã`,
      body: `${formatCurrency(remaining)}. Marque como paga no app quando pagar.`,
      url: "/",
      tag: `expense-${occ.expenseId}-${tomorrow.toISOString()}`,
    });
  }

  const cards = inputs.creditCards.filter((c) => c.active);
  const dueToday = obligationsInRange(input, day, tomorrow);
  for (const bill of dueToday.cardBills) {
    if (bill.payment) continue;
    const { remaining } = openOccurrenceAmounts(bill.amount, bill.partial);
    if (remaining < 0.005) continue;
    const card = cards.find((c) => c.id === bill.cardId);
    if (!card) continue;
    alerts.push({
      title: `Fatura do ${card.name} vence hoje`,
      body: `${formatCurrency(remaining)}. Marque como paga no app quando pagar.`,
      url: "/",
      tag: `bill-due-${card.id}-${day.toISOString()}`,
    });
  }

  for (const card of cards) {
    if (!isClosingDay(card.closingDay, day)) continue;
    alerts.push({
      title: `Fatura do ${card.name} fecha hoje`,
      body: "Compras a partir de amanhã vão para a próxima fatura.",
      url: `/cartoes/${card.id}`,
      tag: `bill-close-${card.id}-${day.toISOString()}`,
    });
  }

  const { budget } = todayBudget(inputs, today);
  for (const reminder of budget.incomeReminders) {
    if (!isSameDay(reminder.dueDate, day)) continue;
    const label = inputs.incomes.find((i) => i.id === reminder.incomeId)?.label ?? "Renda";
    alerts.push({
      title: `Hoje é dia de ${label}`,
      body: `Caiu? Confirme no app para os ${formatCurrency(reminder.amount)} entrarem na conta.`,
      url: "/",
      tag: `income-${reminder.incomeId}-${day.toISOString()}`,
    });
  }

  return alerts;
}

/** O fechamento cai no dia do cartão, ou no último dia de um mês mais curto. */
function isClosingDay(closingDay: number, day: Date): boolean {
  const lastOfMonth = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
  return day.getDate() === Math.min(closingDay, lastOfMonth);
}

/**
 * O que saiu hoje: lançamentos de gasto e compras no cartão com a data de
 * hoje. A compra no cartão conta inteira — é o que a pessoa gastou hoje, mesmo
 * que a fatura venha depois.
 */
export function todaysSpending(inputs: BudgetInputs, today: Date): number {
  // O gasto seu: a transferência para outra conta e a parte emprestada não
  // são o dia passando do limite.
  const cash = inputs.transactions
    .filter((t) => fallsOnDay(t.date, today))
    .reduce((sum, t) => sum + ownSpendingOf(t), 0);
  const card = inputs.cardPurchases
    .filter((p) => fallsOnDay(p.date, today))
    .reduce((sum, p) => sum + ownSpendingOf(p), 0);
  return cash + card;
}

/**
 * As mesmas entradas como estavam no começo do dia: sem os gastos de hoje,
 * nem nos lançamentos nem nos débitos que movem o saldo em conta.
 */
export function withoutTodaysSpending(inputs: BudgetInputs, today: Date): BudgetInputs {
  const removed = inputs.transactions.filter(
    (t) => ownSpendingOf(t) > 0 && fallsOnDay(t.date, today),
  );
  // Os débitos não dizem de onde vieram: tira um débito de hoje com o mesmo
  // valor para cada lançamento removido, e deixa os pagamentos de conta.
  const pending = removed.map((t) => t.amount);
  const debits = inputs.account.debits.filter((d) => {
    if (!d.occurredOn || !isSameDay(d.occurredOn, today)) return true;
    const index = pending.findIndex((amount) => Math.abs(amount - d.amount) < 0.005);
    if (index < 0) return true;
    pending.splice(index, 1);
    return false;
  });
  return {
    ...inputs,
    transactions: inputs.transactions.filter((t) => !removed.includes(t)),
    cardPurchases: inputs.cardPurchases.filter((p) => !fallsOnDay(p.date, today)),
    account: { ...inputs.account, debits },
  };
}

/**
 * Passou do que dava para hoje? Compara o gasto do dia com o "quanto posso
 * gastar hoje" de antes de qualquer gasto. Nulo quando ainda está dentro.
 */
export function overspendAlert(inputs: BudgetInputs, today: Date): Alert | null {
  const spent = todaysSpending(inputs, today);
  if (spent < 0.005) return null;
  const limit = Math.max(
    0,
    todayBudget(withoutTodaysSpending(inputs, today), today).dailyAvailable,
  );
  if (spent <= limit + 0.005) return null;

  const now = todayBudget(inputs, today);
  const until = formatDate(now.budget.periodEnd);
  const ahead =
    now.dailyAvailable > 0.005
      ? `Até ${until} fica ${formatCurrency(now.dailyAvailable)} por dia.`
      : `O período até ${until} já não fecha no azul.`;
  return {
    title:
      limit > 0.005
        ? `Você passou ${formatCurrency(spent - limit)} do limite de hoje`
        : "Hoje já não sobrava nada para gastar",
    body: `Hoje dava ${formatCurrency(limit)} e já foram ${formatCurrency(spent)}. ${ahead}`,
    url: "/",
    // Um por dia: a compra seguinte atualiza o mesmo aviso.
    tag: `overspend-${startOfDay(today).toISOString()}`,
  };
}
