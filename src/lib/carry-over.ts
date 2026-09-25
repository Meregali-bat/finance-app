/**
 * O saldo que passa de um período para o outro.
 *
 * Cada período termina com uma sobra ou com algo que faltou, e o seguinte
 * começa exatamente daí: `abertura(N) = fechamento(N − 1)`. Sem isto cada mês
 * era calculado sozinho — um mês no vermelho não pesava no seguinte, e uma
 * sobra só passava adiante se o usuário a devolvesse à mão no fechamento.
 *
 * O ponto de partida da corrente tem duas fontes, nesta ordem:
 *
 * 1. **O saldo em conta**, quando o usuário o informou. É o dinheiro real, e
 *    já carrega todos os meses anteriores — inclusive o que havia antes do app.
 * 2. **Os períodos anteriores**, encadeados a partir do primeiro que o app
 *    acompanhou, abrindo do zero. É o melhor que dá para saber sem o saldo: o
 *    app não conhece o dinheiro que existia antes dele.
 *
 * Função pura, como period.ts: nada de banco, `today` injetado.
 */

import {
  boundingIncomes,
  budgetForBounds,
  getPeriodBounds,
  getPeriodBoundsDetailed,
  type BudgetInput,
  type PeriodBudget,
} from "./period";

/**
 * Até onde o encadeamento olha para trás: dois anos de ciclos mensais. Além
 * disso a corrente viraria arqueologia — um lançamento esquecido de três anos
 * atrás mudaria o orçamento de hoje —, e quem acompanha há tanto tempo tem o
 * saldo em conta para ancorar a conta no dinheiro real.
 */
export const MAX_CARRY_PERIODS = 24;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** O primeiro dia que o app acompanhou: o cadastro da renda mais antiga. */
function trackingStart(input: BudgetInput): Date | null {
  const created = boundingIncomes(input.incomes)
    .map((income) => income.createdAt)
    .filter((date): date is Date => date !== undefined)
    .map((date) => startOfDay(date).getTime());
  return created.length === 0 ? null : new Date(Math.min(...created));
}

/**
 * Os períodos antes de `periodStart`, do mais antigo ao mais recente.
 *
 * Anda para trás enquanto os períodos se encostam. O primeiro, se começou
 * antes de qualquer dia de pagamento acompanhado, é o que `getPeriodBounds`
 * devolve como reserva — um período de um dia só, porque a reserva é o
 * próprio dia consultado. Ele é esticado até o cadastro da renda, que é
 * quando o app de fato começou a olhar, e a caminhada para ali.
 */
export function previousPeriods(
  input: BudgetInput,
  periodStart: Date,
): { periodStart: Date; periodEnd: Date }[] {
  const periods: { periodStart: Date; periodEnd: Date }[] = [];
  let cursor = periodStart;

  while (periods.length < MAX_CARRY_PERIODS) {
    const previous = getPeriodBoundsDetailed(
      input.incomes,
      addDays(cursor, -1),
      input.incomeReceipts,
    );
    if (previous.periodEnd.getTime() !== cursor.getTime()) break;

    if (previous.fallback) {
      const start = trackingStart(input);
      if (start && start.getTime() < cursor.getTime()) {
        periods.unshift({
          periodStart: new Date(Math.min(start.getTime(), previous.periodStart.getTime())),
          periodEnd: cursor,
        });
      }
      break;
    }

    periods.unshift({ periodStart: previous.periodStart, periodEnd: previous.periodEnd });
    cursor = previous.periodStart;
  }

  return periods;
}

/**
 * O saldo com que o período que começa em `periodStart` abre, somando os
 * anteriores um a um: cada um abre com o fechamento do outro.
 */
export function historyOpeningBalance(input: BudgetInput, periodStart: Date): number {
  let opening = 0;
  for (const period of previousPeriods(input, periodStart)) {
    const budget = budgetForBounds({
      ...input,
      ...period,
      // Visto do último dia dele: o período passado é olhado como terminou.
      today: addDays(period.periodEnd, -1),
      accountBalance: null,
      openingBalance: opening,
    });
    opening = budget.periodBalance;
  }
  return opening;
}

/**
 * O orçamento do período corrente com a herança do anterior já resolvida —
 * o número que a Início mostra e de onde a Previsão parte.
 */
export function calculateCurrentBudget(
  input: BudgetInput & { accountBalance?: number | null },
): PeriodBudget {
  const { periodStart, periodEnd } = getPeriodBounds(
    input.incomes,
    input.today,
    input.incomeReceipts,
  );

  if (input.accountBalance != null) {
    return budgetForBounds({ ...input, periodStart, periodEnd });
  }

  return budgetForBounds({
    ...input,
    periodStart,
    periodEnd,
    accountBalance: null,
    openingBalance: historyOpeningBalance(input, periodStart),
  });
}
