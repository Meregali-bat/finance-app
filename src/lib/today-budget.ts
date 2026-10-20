import { calculateCurrentBudget } from "@/lib/carry-over";
import { forecastPeriods } from "@/lib/forecast";
import { accountBalanceOf, type BudgetInputs } from "@/lib/budget-inputs";

/**
 * O "quanto posso gastar hoje" — a promessa do app —, num lugar só: a Início
 * e o fim do primeiro uso mostram exatamente o mesmo número.
 *
 * Com o saldo em conta informado, o período sai do dinheiro real; sem ele, da
 * corrente dos períodos anteriores. O valor do dia é o livre do período
 * corrente da Previsão: o saldo do período menos o que precisa ficar guardado
 * para um ciclo à frente que não se paga. Sem renda não há ciclos, e vale o
 * saldo do período dividido.
 */
export function todayBudget(inputs: BudgetInputs, today: Date) {
  const accountBalance = accountBalanceOf(inputs, today);
  const budget = calculateCurrentBudget({ ...inputs, accountBalance, today });
  const [current] = forecastPeriods({
    ...inputs,
    openingBalance: budget.openingBalance,
    today,
    count: 0,
  });
  return {
    accountBalance,
    budget,
    dailyAvailable: current?.dailyAvailable ?? budget.dailyAvailable,
    reservedForLater: current?.reservedForLater ?? 0,
  };
}
