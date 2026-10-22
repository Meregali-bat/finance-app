import { calculateCurrentBudget } from "@/lib/carry-over";
import { forecastPeriods } from "@/lib/forecast";
import { accountBalanceOf, type BudgetInputs } from "@/lib/budget-inputs";
import { savingReserve, type SavingReserve } from "@/lib/slices";

/**
 * O "quanto posso gastar hoje" — a promessa do app —, num lugar só: a Início
 * e o fim do primeiro uso mostram exatamente o mesmo número.
 *
 * Com o saldo em conta informado, o período sai do dinheiro real; sem ele, da
 * corrente dos períodos anteriores. O valor do dia é o livre do período
 * corrente da Previsão: o saldo do período menos o que precisa ficar guardado
 * para um ciclo à frente que não se paga. Sem renda não há ciclos, e vale o
 * saldo do período dividido.
 *
 * Com as fatias da renda configuradas, o que ainda falta guardar no período
 * (Metas e Liberdade financeira) sai do número do dia — sem deixá-lo negativo:
 * o que não couber vira `savings.shortfall`, para a tela avisar.
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
  const beforeSavings = current?.dailyAvailable ?? budget.dailyAvailable;
  const days = budget.daysRemaining;
  const savings: SavingReserve | null = inputs.slices
    ? savingReserve({
        income: budget.incomeTotal,
        percents: inputs.slices,
        // O estacionado com data para voltar não é guardado.
        saved: budget.jarDepositTotal - budget.parkedDepositTotal,
        spendable: beforeSavings * days,
      })
    : null;
  return {
    accountBalance,
    budget,
    // A reserva nunca passa do que há, então o resto não fica negativo — mas a
    // conta em ponto flutuante dá -0,0000000001 quando ela leva tudo, e a
    // Início lia isso como orçamento estourado.
    dailyAvailable:
      savings && savings.applied > 0 && days > 0
        ? Math.max(0, (beforeSavings * days - savings.applied) / days)
        : beforeSavings,
    reservedForLater: current?.reservedForLater ?? 0,
    savings,
  };
}
