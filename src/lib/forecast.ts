/**
 * Projeção dos próximos períodos de pagamento.
 *
 * `period.ts` responde "quanto posso gastar hoje" olhando para o ciclo
 * corrente. Este módulo responde "como vai estar o próximo mês": encadeia os
 * ciclos para frente e soma o que já é conhecido — renda fixa, despesa fixa,
 * fatura das compras já lançadas e movimentação agendada com data futura.
 * Nada aqui é estimativa de gasto variável: um número chutado passaria por
 * previsão sem ser uma.
 *
 * Como em `period.ts`, tudo é função pura sobre entradas simples, com `today`
 * injetado, para poder ser testado sem banco.
 */

import {
  buildCardBills,
  findExpensePayment,
  getNextPeriodBounds,
  getPeriodBounds,
  isExpenseOccurrenceValid,
  isOccurrenceValid,
  occurrencesInRange,
  storedDay,
  type CardBillEstimateInput,
  type CardPurchaseInput,
  type CreditCardInput,
  type ExpensePaymentInput,
  type FixedExpenseInput,
  type IncomeInput,
  type IncomeReceiptInput,
  type TransactionInput,
} from "./period";

/**
 * As entradas de `period.ts` com o rótulo que a lista detalhada exibe. Cada
 * uma é um superset do tipo original, então o mesmo objeto serve aos dois
 * módulos sem conversão.
 */
export type ForecastIncomeInput = IncomeInput & { label: string };
export type ForecastFixedExpenseInput = FixedExpenseInput & { label: string };
export type ForecastCreditCardInput = CreditCardInput & { name: string };
export type ForecastTransactionInput = TransactionInput & { id: string; description: string };

export type ForecastEntryKind = "income" | "fixedExpense" | "cardBill" | "scheduled";

export interface ForecastEntry {
  kind: ForecastEntryKind;
  /** income.id | fixedExpense.id | card.id | transaction.id */
  sourceId: string;
  label: string;
  date: Date;
  /** Sempre positivo; o `kind` diz se o dinheiro entra ou sai. */
  amount: number;
  /** Recebimento ou pagamento já registrado, em vez de projetado. */
  confirmed: boolean;
  /** Só em `cardBill`: o ciclo ainda não fechou, então o valor pode crescer. */
  partial?: boolean;
}

export interface PeriodForecast {
  /** 0 é o período corrente, 1 o próximo, e assim por diante. */
  offset: number;
  periodStart: Date;
  /** Exclusivo: o primeiro dia fora do período. */
  periodEnd: Date;
  totalDays: number;
  incomeTotal: number;
  fixedExpenseTotal: number;
  cardBillTotal: number;
  scheduledTotal: number;
  balance: number;
  dailyAvailable: number;
  entries: ForecastEntry[];
}

export interface ForecastInput {
  incomes: ForecastIncomeInput[];
  incomeReceipts?: IncomeReceiptInput[];
  fixedExpenses: ForecastFixedExpenseInput[];
  creditCards: ForecastCreditCardInput[];
  cardPurchases: CardPurchaseInput[];
  billEstimates?: CardBillEstimateInput[];
  expensePayments?: ExpensePaymentInput[];
  transactions: ForecastTransactionInput[];
  today: Date;
}

/**
 * Até onde a navegação vai. Doze ciclos é cerca de um ano — além disso a
 * projeção seria só a repetição do mesmo mês, sem informação nova.
 */
export const MAX_FORECAST_OFFSET = 12;

/** A tela abre no próximo período: é a pergunta que ela existe para responder. */
export const DEFAULT_FORECAST_OFFSET = 1;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function diffCalendarDays(a: Date, b: Date): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / MS_PER_DAY);
}

/**
 * O `?p=` da URL como um deslocamento utilizável. Parâmetro ausente, repetido,
 * quebrado ou fora da faixa nunca é erro — cai no padrão, do mesmo jeito que
 * `resolveRange` cai no mês corrente.
 */
export function resolveForecastOffset(param: string | string[] | undefined): number {
  const raw = Array.isArray(param) ? param[0] : param;
  if (raw === undefined || !/^\d+$/.test(raw)) return DEFAULT_FORECAST_OFFSET;
  const offset = Number(raw);
  if (offset > MAX_FORECAST_OFFSET) return DEFAULT_FORECAST_OFFSET;
  return offset;
}

/** O recebimento confirmado de uma ocorrência de renda, se houver. */
function findIncomeReceipt(
  receipts: IncomeReceiptInput[],
  incomeId: string,
  occurrence: Date,
): IncomeReceiptInput | undefined {
  return receipts.find(
    (r) => r.incomeId === incomeId && storedDay(r.occurrenceDate).getTime() === occurrence.getTime(),
  );
}

function forecastOnePeriod(
  input: ForecastInput,
  periodStart: Date,
  periodEnd: Date,
  offset: number,
): PeriodForecast {
  const {
    incomes,
    incomeReceipts = [],
    fixedExpenses,
    creditCards,
    cardPurchases,
    billEstimates = [],
    expensePayments = [],
    transactions,
    today,
  } = input;

  /**
   * A renda projetada é a cadastrada, e não a confirmada. `calculateDailyBudget`
   * conta só o que já entrou — regra certa para o orçamento de hoje, que não
   * pode inflar com dinheiro que ainda não chegou, e errada para uma previsão,
   * onde ela zeraria toda a receita futura. Quando o recebimento existe (o que
   * só acontece no período corrente), o valor real prevalece sobre a estimativa.
   */
  const incomeEntries: ForecastEntry[] = incomes.flatMap((income) =>
    occurrencesInRange(income.dayOfMonth, periodStart, periodEnd)
      .filter((occurrence) => isOccurrenceValid(occurrence, income.createdAt))
      .map((occurrence) => {
        const receipt = findIncomeReceipt(incomeReceipts, income.id, occurrence);
        return {
          kind: "income" as const,
          sourceId: income.id,
          label: income.label,
          date: occurrence,
          amount: receipt ? receipt.amount : income.amount,
          confirmed: receipt !== undefined,
        };
      }),
  );

  // A despesa ligada a cartão não vira linha própria: ela já está dentro da
  // fatura, e listá-la também aqui cobraria o mesmo dinheiro duas vezes.
  const standaloneExpenses = fixedExpenses.filter((expense) => !expense.cardId);
  const cardExpenses = fixedExpenses.filter((expense) => expense.cardId);

  const fixedExpenseEntries: ForecastEntry[] = standaloneExpenses.flatMap((expense) => {
    if (expense.dueDay == null) return [];
    return occurrencesInRange(expense.dueDay, periodStart, periodEnd)
      .filter((occurrence) => isExpenseOccurrenceValid(occurrence, expense))
      .map((dueDate) => {
        const payment = findExpensePayment(expensePayments, { fixedExpenseId: expense.id }, dueDate);
        return {
          kind: "fixedExpense" as const,
          sourceId: expense.id,
          label: expense.label,
          date: dueDate,
          amount: payment ? payment.amount : expense.amount,
          confirmed: payment !== undefined,
        };
      });
  });

  const todayStart = startOfDay(today);

  /**
   * A fatura vem inteira de `buildCardBills`, a fonte única do "quanto é a
   * fatura que vence no dia X". Recalcular aqui perderia justamente o que ela
   * sabe e a previsão mais precisa: as parcelas que caem em ciclos futuros e
   * os valores que o usuário lançou à mão para uma fatura que ainda não fechou.
   *
   * Dois vencimentos bastam por período — a série já começa no primeiro
   * vencimento em ou depois de `periodStart`, e um período vai de um pagamento
   * ao seguinte.
   */
  const cardBillEntries: ForecastEntry[] = creditCards.flatMap((card) =>
    buildCardBills({
      card,
      purchases: cardPurchases,
      cardFixedExpenses: cardExpenses,
      billEstimates,
      expensePayments,
      from: periodStart,
      months: 2,
    })
      .filter((bill) => bill.dueDate.getTime() < periodEnd.getTime() && bill.amount > 0)
      .map((bill) => ({
        kind: "cardBill" as const,
        sourceId: bill.cardId,
        label: `Fatura do ${card.name}`,
        date: bill.dueDate,
        amount: bill.paidAmount ?? bill.amount,
        confirmed: bill.paid,
        // Enquanto o fechamento não passou, compras novas ainda caem nesta
        // fatura — o valor mostrado é um piso, não o total.
        partial: !bill.paid && bill.cycleEnd.getTime() >= todayStart.getTime(),
      })),
  );

  /**
   * Movimentação já lançada com data dentro do período. Receita fica gravada
   * com valor negativo, então ela entra como renda com o sinal invertido — a
   * mesma leitura que `report-totals.ts` faz do histórico.
   */
  const scheduledEntries: ForecastEntry[] = transactions
    .filter((transaction) => {
      const day = storedDay(transaction.date).getTime();
      return day >= periodStart.getTime() && day < periodEnd.getTime();
    })
    .map((transaction) => ({
      kind: transaction.amount < 0 ? ("income" as const) : ("scheduled" as const),
      sourceId: transaction.id,
      label: transaction.description,
      date: storedDay(transaction.date),
      amount: Math.abs(transaction.amount),
      confirmed: true,
    }));

  const entries = [
    ...incomeEntries,
    ...fixedExpenseEntries,
    ...cardBillEntries,
    ...scheduledEntries,
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  const sumOf = (kind: ForecastEntryKind) =>
    entries.filter((entry) => entry.kind === kind).reduce((sum, entry) => sum + entry.amount, 0);

  const incomeTotal = sumOf("income");
  const fixedExpenseTotal = sumOf("fixedExpense");
  const cardBillTotal = sumOf("cardBill");
  const scheduledTotal = sumOf("scheduled");

  const balance = incomeTotal - fixedExpenseTotal - cardBillTotal - scheduledTotal;
  const totalDays = diffCalendarDays(periodEnd, periodStart);

  return {
    offset,
    periodStart,
    periodEnd,
    totalDays,
    incomeTotal,
    fixedExpenseTotal,
    cardBillTotal,
    scheduledTotal,
    balance,
    dailyAvailable: totalDays > 0 ? balance / totalDays : 0,
    entries,
  };
}

/**
 * Os períodos de deslocamento 0 (o corrente) até `count`, inclusive, cada um
 * encadeado a partir do fim do anterior.
 *
 * `maxOffset` existe porque o teto da navegação não é o teto do que dá para
 * projetar: a tela de Previsão para em MAX_FORECAST_OFFSET porque além disso
 * ela só repetiria o mesmo mês, enquanto a simulação de uma compra parcelada
 * precisa alcançar a última parcela, que pode estar mais longe. O padrão
 * mantém o comportamento da tela intacto.
 *
 * Sem nenhuma renda ativa não há de onde tirar um ciclo — `getPeriodBounds`
 * degenera num período de um dia que não avança — e a resposta honesta é uma
 * lista vazia, que a tela traduz num convite a cadastrar a primeira renda.
 */
export function forecastPeriods(
  input: ForecastInput & { count: number; maxOffset?: number },
): PeriodForecast[] {
  if (input.incomes.length === 0) return [];

  const count = Math.min(Math.max(0, input.count), input.maxOffset ?? MAX_FORECAST_OFFSET);
  const forecasts: PeriodForecast[] = [];

  let bounds = getPeriodBounds(input.incomes, input.today, input.incomeReceipts);
  for (let offset = 0; offset <= count; offset++) {
    forecasts.push(forecastOnePeriod(input, bounds.periodStart, bounds.periodEnd, offset));
    bounds = getNextPeriodBounds(input.incomes, bounds.periodEnd, input.incomeReceipts);
  }

  return forecasts;
}
