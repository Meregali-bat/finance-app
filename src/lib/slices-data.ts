import { prisma } from "@/lib/prisma";
import { loadBudgetInputs } from "@/lib/budget-inputs";
import { todayBudget } from "@/lib/today-budget";
import { loadHistoryItems } from "@/lib/history-items";
import { countsAsSpending, ownSpending } from "@/lib/report-totals";
import { isSliceKey, sliceOfCategory, sliceUsage, type SliceKey } from "@/lib/slices";
import { obligationsInRange, openOccurrenceAmounts } from "@/lib/period";

/** Um dia local como meia-noite UTC: a borda que os lançamentos usam. */
const utcMidnight = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));

/**
 * Tudo o que as telas das fatias mostram do período corrente: a renda, a
 * reserva para guardar, o uso de cada fatia e o gasto ainda sem categoria.
 * O gasto vem do mesmo `loadHistoryItems` do Histórico — as duas telas somam
 * o mesmo dinheiro do mesmo jeito.
 */
export async function loadSlicesOverview(userId: string, today: Date) {
  const inputs = await loadBudgetInputs(userId);
  const { budget, savings, dailyAvailable } = todayBudget(inputs, today);
  const range = {
    rangeStart: budget.periodStart,
    rangeEnd: budget.periodEnd,
    utcRangeStart: utcMidnight(budget.periodStart),
    utcRangeEnd: utcMidnight(budget.periodEnd),
  };
  const [{ items, categories, categoryNameById }, deposits, fixedCategories] = await Promise.all([
    loadHistoryItems(userId, range),
    prisma.jarDeposit.findMany({
      // O estacionado com data para voltar não é guardado.
      where: {
        userId,
        plannedWithdrawalAt: null,
        createdAt: { gte: budget.periodStart, lt: budget.periodEnd },
      },
      select: { amount: true, jar: { select: { slice: true } } },
    }),
    prisma.fixedExpense.findMany({
      where: { userId },
      select: { id: true, label: true, categoryId: true, category: { select: { name: true } } },
    }),
  ]);

  const sliceByCategory = new Map<string, SliceKey>(
    categories.map((c) => [c.id, sliceOfCategory(c)]),
  );
  // Categoria desativada ainda dá o palpite pelo nome.
  const sliceOf = (categoryId: string) =>
    sliceByCategory.get(categoryId) ??
    sliceOfCategory({ name: categoryNameById.get(categoryId) ?? "" });

  // O emprestado fica de fora: é dinheiro que volta, não gasto seu.
  const spendingItems = items.filter((i) => countsAsSpending(i) && !i.lentTo);
  // A fatia trocada no lançamento vale mais que a da categoria — e conta
  // mesmo sem categoria.
  const chosen = (i: { slice?: string | null }) => (isSliceKey(i.slice) ? i.slice : null);
  const spending = spendingItems
    .filter((i) => chosen(i) || i.categoryId)
    // Só a parte sua: o emprestado de uma compra dividida volta.
    .map((i) => ({ slice: chosen(i) ?? sliceOf(i.categoryId!), amount: ownSpending(i) }));
  const uncategorized: {
    id: string;
    kind: string;
    description: string;
    amount: number;
    date: Date;
    cardName?: string | null;
  }[] = spendingItems
    .filter((i) => !i.categoryId && !chosen(i))
    .map((i) => ({ ...i, amount: ownSpending(i) }));

  // A conta fixa do período que ainda não foi paga também já é da fatia dela:
  // o dinheiro está comprometido, e o orçamento já o desconta. O que um
  // parcial pagou já veio como pagamento; aqui entra só o que falta.
  const fixedCategoryOf = new Map(fixedCategories.map((f) => [f.id, f]));
  let toPay = 0;
  const { fixedExpenseOccurrences } = obligationsInRange(
    { ...inputs, today },
    budget.periodStart,
    budget.periodEnd,
  );
  for (const occ of fixedExpenseOccurrences) {
    if (occ.payment) continue;
    const { remaining } = openOccurrenceAmounts(occ.estimate, occ.partial);
    const fixed = fixedCategoryOf.get(occ.expenseId);
    if (remaining < 0.005) continue;
    toPay += remaining;
    // Sem categoria, a conta não entra em fatia, mas continua à vista.
    if (!fixed?.categoryId) {
      uncategorized.push({
        id: `${occ.expenseId}-${occ.dueDate.toISOString()}`,
        kind: "fixedExpenseOpen",
        description: fixed?.label ?? "Conta fixa",
        amount: remaining,
        date: occ.dueDate,
      });
      continue;
    }
    spending.push({
      slice:
        sliceByCategory.get(fixed.categoryId) ??
        sliceOfCategory({ name: fixed.category?.name ?? "" }),
      amount: remaining,
    });
  }

  const saved = deposits.map((d) => ({
    slice: (isSliceKey(d.jar.slice) && (d.jar.slice === "goals" || d.jar.slice === "freedom")
      ? d.jar.slice
      : "freedom") as SliceKey,
    amount: Number(d.amount),
  }));

  return {
    configured: inputs.slices !== null,
    percents: inputs.slices,
    periodStart: budget.periodStart,
    periodEnd: budget.periodEnd,
    income: budget.incomeTotal,
    dailyAvailable,
    savings,
    /** Do gasto das fatias, o que ainda são contas fixas a pagar no período. */
    toPay: Math.round(toPay * 100) / 100,
    usage: inputs.slices
      ? sliceUsage({ income: budget.incomeTotal, percents: inputs.slices, spending, saved })
      : [],
    uncategorized,
    categories,
  };
}
