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
 * Cada ciclo abre com o saldo com que o anterior fechou. O primeiro abre com a
 * herança que `calculateCurrentBudget` (carry-over.ts) resolveu para o período
 * corrente — a mesma que a Início usa —, então o período 0 daqui e o "Saldo do
 * período" de lá são o mesmo número.
 *
 * Como em `period.ts`, tudo é função pura sobre entradas simples, com `today`
 * injetado, para poder ser testado sem banco.
 */

import {
  boundingIncomes,
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
  type JarDepositInput,
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

export type ForecastEntryKind = "income" | "fixedExpense" | "cardBill" | "scheduled" | "jar";

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
  /**
   * Só em `income`: o dia do pagamento já passou e o recebimento não foi
   * confirmado. A linha aparece, mas fica fora dos totais — a mesma regra do
   * orçamento da Início, que não conta salário que ninguém disse ter chegado.
   */
  awaiting?: boolean;
}

export interface PeriodForecast {
  /** 0 é o período corrente, 1 o próximo, e assim por diante. */
  offset: number;
  periodStart: Date;
  /** Exclusivo: o primeiro dia fora do período. */
  periodEnd: Date;
  totalDays: number;
  /** Dias até o fim contando hoje, no corrente; o ciclo inteiro, nos futuros. */
  daysLeft: number;
  /** O saldo com que o período abre: o fechamento do anterior. */
  openingBalance: number;
  incomeTotal: number;
  /**
   * A renda que o ciclo deveria ter, contando a que ainda aguarda confirmação.
   * É a base do comprometimento, que mede o peso das contas sobre a renda e
   * não pode dobrar só porque o salário de hoje ainda não foi marcado.
   */
  expectedIncomeTotal: number;
  fixedExpenseTotal: number;
  cardBillTotal: number;
  scheduledTotal: number;
  jarTotal: number;
  /** Só o que acontece no período: entradas menos saídas, sem a herança. */
  periodResult: number;
  /**
   * O saldo com que o período fecha se nada além do comprometido for gasto —
   * nem neste ciclo nem nos anteriores: `openingBalance + periodResult`. É a
   * régua de "algum ciclo fica no vermelho?", não um dinheiro livre: a sobra
   * que ele acumula é a mesma que os ciclos anteriores já ofereceram para gastar.
   */
  balance: number;
  /**
   * O que o ciclo recebe dos anteriores se cada um gastar só o seu livre: no
   * corrente, a herança de verdade (`openingBalance`); nos futuros, a reserva
   * que o ciclo anterior guardou para eles.
   */
  inherited: number;
  /**
   * Quanto dá para gastar neste ciclo sem deixar nenhum ciclo seguinte do
   * horizonte no vermelho. Nunca negativo. Somado ciclo a ciclo, nunca passa do
   * dinheiro que existe — ao contrário de `balance`, que oferece a mesma sobra
   * em todo mês.
   */
  freeToSpend: number;
  /**
   * O saldo com que o ciclo fecha se cada ciclo, até ele, gastar só o seu
   * livre: `inherited + periodResult − freeToSpend`. Negativo quando o ciclo
   * não se paga nem com o que herdou — e esse negativo passa para o seguinte.
   */
  endBalance: number;
  /** A parte positiva de `endBalance`: o que fica guardado para ciclos à frente. */
  reservedForLater: number;
  /**
   * O "pode gastar por dia": `freeToSpend` pelos dias, ou, num ciclo que fecha
   * no vermelho, o estouro pelos dias.
   */
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
  jarDeposits?: JarDepositInput[];
  /**
   * O saldo com que o período corrente abre — `openingBalance` do orçamento
   * que `calculateCurrentBudget` devolve. Ausente, ele abre do zero.
   */
  openingBalance?: number;
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
  openingBalance: number,
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
    jarDeposits = [],
    today,
  } = input;

  const todayStart = startOfDay(today);
  const inPeriod = (day: Date) =>
    day.getTime() >= periodStart.getTime() && day.getTime() < periodEnd.getTime();

  /**
   * A renda tem duas origens, e as duas regras são as do orçamento da Início.
   *
   * O que já foi confirmado entra pelo valor que caiu, seja de qual renda for —
   * inclusive de uma desligada depois, ou de um pagamento anterior ao cadastro:
   * é dinheiro que entrou.
   *
   * O que não foi confirmado só entra se ainda vai acontecer. Um dia de
   * pagamento que já passou sem confirmação aparece como aguardando, mas fica
   * fora da conta: é o que impede este período de prometer um dinheiro que a
   * Início, com razão, ainda não conta.
   */
  const incomeLabel = new Map(incomes.map((income) => [income.id, income.label]));
  const receiptEntries: ForecastEntry[] = incomeReceipts
    .filter((receipt) => inPeriod(storedDay(receipt.occurrenceDate)))
    .map((receipt) => ({
      kind: "income" as const,
      sourceId: receipt.incomeId,
      label: incomeLabel.get(receipt.incomeId) ?? "Receita",
      date: storedDay(receipt.occurrenceDate),
      amount: receipt.amount,
      confirmed: true,
    }));

  const projectedIncomeEntries: ForecastEntry[] = boundingIncomes(incomes).flatMap((income) =>
    occurrencesInRange(income.dayOfMonth, periodStart, periodEnd)
      .filter((occurrence) => isOccurrenceValid(occurrence, income.createdAt))
      .filter((occurrence) => !findIncomeReceipt(incomeReceipts, income.id, occurrence))
      .map((occurrence) => ({
        kind: "income" as const,
        sourceId: income.id,
        label: income.label,
        date: occurrence,
        amount: income.amount,
        confirmed: false,
        ...(occurrence.getTime() <= todayStart.getTime() ? { awaiting: true } : {}),
      })),
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
   *
   * As linhas do fechamento antigo ficam de fora: eram a sobra do período
   * anterior devolvida à mão, e agora ela chega pelo `openingBalance`.
   */
  const scheduledEntries: ForecastEntry[] = transactions
    .filter((transaction) => !transaction.fromPeriodClose)
    .filter((transaction) => inPeriod(storedDay(transaction.date)))
    .map((transaction) => ({
      kind: transaction.amount < 0 ? ("income" as const) : ("scheduled" as const),
      sourceId: transaction.id,
      label: transaction.description,
      date: storedDay(transaction.date),
      amount: Math.abs(transaction.amount),
      confirmed: true,
    }));

  const jarEntries: ForecastEntry[] = jarDeposits
    .filter((deposit) => inPeriod(startOfDay(deposit.date)))
    .map((deposit, index) => ({
      kind: "jar" as const,
      sourceId: `jar-${index}`,
      label: "Guardado em caixinha",
      date: startOfDay(deposit.date),
      amount: deposit.amount,
      confirmed: true,
    }));

  const entries = [
    ...receiptEntries,
    ...projectedIncomeEntries,
    ...fixedExpenseEntries,
    ...cardBillEntries,
    ...scheduledEntries,
    ...jarEntries,
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  const sumOf = (kind: ForecastEntryKind) =>
    entries
      .filter((entry) => entry.kind === kind && !entry.awaiting)
      .reduce((sum, entry) => sum + entry.amount, 0);

  const incomeTotal = sumOf("income");
  const expectedIncomeTotal = entries
    .filter((entry) => entry.kind === "income")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const fixedExpenseTotal = sumOf("fixedExpense");
  const cardBillTotal = sumOf("cardBill");
  const scheduledTotal = sumOf("scheduled");
  const jarTotal = sumOf("jar");

  const periodResult =
    incomeTotal - fixedExpenseTotal - cardBillTotal - scheduledTotal - jarTotal;
  const balance = openingBalance + periodResult;
  const totalDays = diffCalendarDays(periodEnd, periodStart);
  // No corrente, o dinheiro que resta tem de durar só os dias que faltam —
  // a mesma divisão que a Início faz para o "pode gastar hoje".
  const daysLeft = offset === 0 ? Math.max(1, diffCalendarDays(periodEnd, today)) : totalDays;

  return {
    offset,
    periodStart,
    periodEnd,
    totalDays,
    daysLeft,
    openingBalance,
    incomeTotal,
    expectedIncomeTotal,
    fixedExpenseTotal,
    cardBillTotal,
    scheduledTotal,
    jarTotal,
    periodResult,
    balance,
    // Provisórios: `forecastPeriods` só sabe quanto reservar depois de ver
    // os ciclos seguintes, e reescreve estes em `withReserves`.
    inherited: openingBalance,
    freeToSpend: balance,
    endBalance: 0,
    reservedForLater: 0,
    dailyAvailable: daysLeft > 0 ? balance / daysLeft : 0,
    entries,
  };
}

/**
 * Quanto cada ciclo pode gastar sem que nenhum ciclo seguinte feche no vermelho.
 *
 * `balance` é o saldo acumulado supondo que nada além do comprometido seja
 * gasto. O que cada ciclo gasta a mais (o livre) se acumula também, e a
 * condição é que o gasto acumulado nunca passe do `balance` de nenhum ciclo à
 * frente. O teto do gasto acumulado até o ciclo N é então o menor `balance` de
 * N até o fim do horizonte — o mínimo dos sufixos, M(N).
 *
 * O livre nunca é negativo: não existe gastar menos que zero para cobrir um
 * buraco. Um ciclo que não se paga fecha negativo, e esse negativo é a herança
 * do seguinte — que só tem livre depois de cobri-lo. Cada ciclo gasta, então,
 * o quanto o teto subiu além do que já foi gasto:
 * `livre(N) = max(0, M(N) − gasto acumulado até N − 1)`.
 *
 * Com meses que se pagam, M(N) é o próprio `balance` e o livre de um ciclo
 * futuro é só o resultado dele — a sobra de um mês não é prometida de novo no
 * seguinte. Quando um ciclo à frente não se paga (um IPVA, uma fatura grande),
 * os anteriores guardam a diferença em vez de oferecê-la.
 */
function withReserves(periods: PeriodForecast[]): PeriodForecast[] {
  const suffixMin = new Array<number>(periods.length);
  let min = Infinity;
  for (let i = periods.length - 1; i >= 0; i--) {
    min = Math.min(min, periods[i].balance);
    suffixMin[i] = min;
  }

  let spent = 0;
  let previousEnd = 0;
  return periods.map((period, i) => {
    const freeToSpend = Math.max(0, suffixMin[i] - spent);
    // O que veio do anterior seguindo o plano: a reserva que ele guardou, ou o
    // que faltou nele — com sinal, para um vermelho não sumir na virada.
    const inherited = i === 0 ? period.openingBalance : previousEnd;
    spent += freeToSpend;
    const endBalance = period.balance - spent;
    previousEnd = endBalance;
    return {
      ...period,
      inherited,
      freeToSpend,
      endBalance,
      reservedForLater: Math.max(0, endBalance),
      // No vermelho, o "por dia" mostra o tamanho do estouro, como a Início
      // sempre mostrou; fora dele, o que dá para gastar.
      dailyAvailable:
        period.daysLeft > 0 ? (endBalance < 0 ? endBalance : freeToSpend) / period.daysLeft : 0,
    };
  });
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
 * Cada ciclo abre com o fechamento do anterior, e o primeiro com
 * `input.openingBalance`.
 *
 * Sem nenhuma renda ativa não há de onde tirar um ciclo — `getPeriodBounds`
 * degenera num período de um dia que não avança — e a resposta honesta é uma
 * lista vazia, que a tela traduz num convite a cadastrar a primeira renda.
 */
export function forecastPeriods(
  input: ForecastInput & { count: number; maxOffset?: number },
): PeriodForecast[] {
  if (boundingIncomes(input.incomes).length === 0) return [];

  const count = Math.min(Math.max(0, input.count), input.maxOffset ?? MAX_FORECAST_OFFSET);
  // A reserva olha sempre pelo menos MAX_FORECAST_OFFSET ciclos à frente,
  // mesmo quando se pede só o corrente: é o que faz o "por dia" da Início e o
  // do ciclo corrente da Previsão serem o mesmo número.
  const horizon = Math.max(count, MAX_FORECAST_OFFSET);
  const forecasts: PeriodForecast[] = [];

  let bounds = getPeriodBounds(input.incomes, input.today, input.incomeReceipts);
  let opening = input.openingBalance ?? 0;
  for (let offset = 0; offset <= horizon; offset++) {
    const period = forecastOnePeriod(input, bounds.periodStart, bounds.periodEnd, offset, opening);
    forecasts.push(period);
    // O fechamento de um ciclo é a abertura do seguinte — inclusive quando ele
    // fecha no vermelho: o que faltou num mês não some no outro.
    opening = period.balance;
    bounds = getNextPeriodBounds(input.incomes, bounds.periodEnd, input.incomeReceipts);
  }

  return withReserves(forecasts).slice(0, count + 1);
}
