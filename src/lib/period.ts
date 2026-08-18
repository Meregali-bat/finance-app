/**
 * Pure calculation module for the "how much can I spend today" budget.
 *
 * A "period" runs from one payday to the next, considering ALL active income
 * sources combined (not just one). Everything here is a pure function over
 * plain inputs so it can be unit tested without touching the database.
 */

export interface IncomeInput {
  id: string;
  amount: number;
  dayOfMonth: number;
  /** When omitted, every occurrence is treated as valid (useful for tests). */
  createdAt?: Date;
}

export interface IncomeReceiptInput {
  incomeId: string;
  /** The occurrence (payday) this confirmation applies to. */
  occurrenceDate: Date;
  /** The amount actually received, which may differ from the income's registered amount. */
  amount: number;
}

export interface FixedExpenseInput {
  id: string;
  amount: number;
  /** Required when standalone (no cardId); ignored when billed on a card, since the card's own due date applies. */
  dueDay?: number;
  /** When omitted, every occurrence is treated as valid (useful for tests). */
  createdAt?: Date;
  /** When set, this expense is billed on a credit card instead of standing alone. */
  cardId?: string;
}

export interface CreditCardInput {
  id: string;
  closingDay: number;
  dueDay: number;
}

export interface CardPurchaseInput {
  cardId: string;
  /** O TOTAL da compra, não o valor da parcela. */
  amount: number;
  date: Date;
  /** Em quantas parcelas. Ausente ou 1 = valor inteiro num único ciclo. */
  installments?: number;
}

/**
 * Confirmação de que uma ocorrência de despesa foi paga. Exatamente um entre
 * fixedExpenseId e cardId vem preenchido.
 */
export interface ExpensePaymentInput {
  fixedExpenseId?: string;
  cardId?: string;
  /** O vencimento da ocorrência quitada — não a data em que o usuário pagou. */
  dueDate: Date;
  /** O valor realmente pago, que pode diferir da estimativa. */
  amount: number;
}

export interface TransactionInput {
  amount: number;
  date: Date;
}

export interface CardBillReminder {
  cardId: string;
  dueDate: Date;
  amount: number;
}

export interface FixedExpenseReminder {
  expenseId: string;
  dueDate: Date;
  amount: number;
}

export interface IncomeReminder {
  incomeId: string;
  dueDate: Date;
  amount: number;
}

export interface PeriodBudget {
  periodStart: Date;
  periodEnd: Date;
  daysRemaining: number;
  incomeTotal: number;
  fixedExpenseTotal: number;
  cardBillTotal: number;
  transactionTotal: number;
  periodBalance: number;
  dailyAvailable: number;
  cardBillReminders: CardBillReminder[];
  fixedExpenseReminders: FixedExpenseReminder[];
  incomeReminders: IncomeReminder[];
}

/** O dia de um instante real — agora, ou quando um registro foi criado. */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * O dia de uma data que o banco guarda como dia de calendário: vencimento,
 * ocorrência de recebimento, data de lançamento.
 *
 * Elas são gravadas como meia-noite do fuso de quem gravou, então o dia
 * pretendido está na parte **UTC** do valor — e não na parte local, que
 * depende de quem está lendo. Um vencimento no dia 10 aparece como
 * `2026-08-10 00:00` nas linhas gravadas por um servidor em UTC e como
 * `2026-08-10 03:00` nas gravadas em horário de Brasília; lidas em UTC as
 * duas dizem dia 10, e é isso que faz uma confirmação continuar casando com
 * a ocorrência calculada mesmo que o servidor mude de fuso.
 *
 * O retorno é meia-noite local, a mesma forma que `dateForDayInMonth`
 * produz, para os dois lados da comparação falarem a mesma língua.
 */
function storedDay(date: Date): Date {
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Clamps a day-of-month (1-31) to a real date, e.g. 31 in February -> Feb 28/29. */
function dateForDayInMonth(year: number, month: number, day: number): Date {
  const clampedDay = Math.min(day, daysInMonth(year, month));
  return new Date(year, month, clampedDay);
}

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/** Latest occurrence of dayOfMonth that is <= reference. */
function latestOccurrenceOnOrBefore(dayOfMonth: number, reference: Date): Date {
  const ref = startOfDay(reference);
  const candidate = dateForDayInMonth(ref.getFullYear(), ref.getMonth(), dayOfMonth);
  if (candidate.getTime() <= ref.getTime()) return candidate;
  const prev = addMonths(ref.getFullYear(), ref.getMonth(), -1);
  return dateForDayInMonth(prev.year, prev.month, dayOfMonth);
}

/** Earliest occurrence of dayOfMonth that is strictly after reference. */
function earliestOccurrenceAfter(dayOfMonth: number, reference: Date): Date {
  const ref = startOfDay(reference);
  const candidate = dateForDayInMonth(ref.getFullYear(), ref.getMonth(), dayOfMonth);
  if (candidate.getTime() > ref.getTime()) return candidate;
  const next = addMonths(ref.getFullYear(), ref.getMonth(), 1);
  return dateForDayInMonth(next.year, next.month, dayOfMonth);
}

/** A primeira ocorrência de dayOfMonth em ou depois de reference. */
function earliestOccurrenceOnOrAfter(dayOfMonth: number, reference: Date): Date {
  const ref = startOfDay(reference);
  const candidate = dateForDayInMonth(ref.getFullYear(), ref.getMonth(), dayOfMonth);
  if (candidate.getTime() >= ref.getTime()) return candidate;
  const next = addMonths(ref.getFullYear(), ref.getMonth(), 1);
  return dateForDayInMonth(next.year, next.month, dayOfMonth);
}

/** Latest occurrence of dayOfMonth strictly before reference. */
function latestOccurrenceBefore(dayOfMonth: number, reference: Date): Date {
  const ref = startOfDay(reference);
  const candidate = dateForDayInMonth(ref.getFullYear(), ref.getMonth(), dayOfMonth);
  if (candidate.getTime() < ref.getTime()) return candidate;
  const prev = addMonths(ref.getFullYear(), ref.getMonth(), -1);
  return dateForDayInMonth(prev.year, prev.month, dayOfMonth);
}

/** All occurrences of dayOfMonth within [start, end). */
function occurrencesInRange(dayOfMonth: number, start: Date, end: Date): Date[] {
  const occurrences: Date[] = [];
  let cursor = addMonths(start.getFullYear(), start.getMonth(), -1);
  for (let i = 0; i < 3; i++) {
    const d = dateForDayInMonth(cursor.year, cursor.month, dayOfMonth);
    if (d.getTime() >= start.getTime() && d.getTime() < end.getTime()) {
      occurrences.push(d);
    }
    cursor = addMonths(cursor.year, cursor.month, 1);
  }
  return occurrences;
}

function diffCalendarDays(a: Date, b: Date): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / MS_PER_DAY);
}

/**
 * An occurrence only "counts" if it happened on or after the record was
 * created — otherwise a freshly-added income/expense would retroactively
 * invent a past payday/due date that was never actually tracked.
 */
function isOccurrenceValid(occurrence: Date, createdAt: Date | undefined): boolean {
  if (!createdAt) return true;
  return occurrence.getTime() >= startOfDay(createdAt).getTime();
}

/**
 * How far back before an income's registration a payday can sit and still be
 * worth asking about. A payday from the days just before the user set the
 * income up is very likely the money they're living on right now; anything
 * older belongs to a stretch the app never tracked.
 */
const PRE_REGISTRATION_GRACE_DAYS = 7;

/** Whether a payday is recent enough to be worth asking the user about. */
function isPaydayAskable(occurrence: Date, createdAt: Date | undefined): boolean {
  if (!createdAt || isOccurrenceValid(occurrence, createdAt)) return true;
  return diffCalendarDays(startOfDay(createdAt), occurrence) <= PRE_REGISTRATION_GRACE_DAYS;
}

/** Whether the user has confirmed receiving a specific payday. */
function isPaydayConfirmed(
  receipts: IncomeReceiptInput[],
  incomeId: string,
  occurrence: Date,
): boolean {
  return receipts.some(
    (r) => r.incomeId === incomeId && storedDay(r.occurrenceDate).getTime() === occurrence.getTime(),
  );
}

/**
 * O pagamento que quita uma ocorrência, se houver. A chave é o par
 * (de quem é a despesa, qual vencimento) — comparar só por data quitaria a
 * ocorrência errada quando duas despesas vencem no mesmo dia.
 */
function findExpensePayment(
  payments: ExpensePaymentInput[],
  key: { fixedExpenseId?: string; cardId?: string },
  dueDate: Date,
): ExpensePaymentInput | undefined {
  const day = storedDay(dueDate).getTime();
  return payments.find(
    (p) =>
      p.fixedExpenseId === key.fixedExpenseId &&
      p.cardId === key.cardId &&
      storedDay(p.dueDate).getTime() === day,
  );
}

/**
 * The current period's boundaries, derived from every active income's
 * recurring day-of-month. periodStart is the most recent payday across all
 * sources; periodEnd is the soonest upcoming one (exclusive). If no income
 * has a usable past occurrence yet (e.g. a brand-new income whose first
 * payday hasn't happened), periodStart falls back to today.
 *
 * A payday that predates its income's creation is normally ignored, so that
 * registering an income doesn't retroactively invent a period that was never
 * tracked. Confirming it lifts that restriction: the user saying the money
 * arrived is first-hand evidence, not an invention.
 */
export function getPeriodBounds(
  incomes: IncomeInput[],
  today: Date,
  incomeReceipts: IncomeReceiptInput[] = [],
): {
  periodStart: Date;
  periodEnd: Date;
} {
  if (incomes.length === 0) {
    const start = startOfDay(today);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { periodStart: start, periodEnd: end };
  }

  const futureOccurrences = incomes.map((inc) => earliestOccurrenceAfter(inc.dayOfMonth, today));
  const validPastOccurrences = incomes
    .map((inc) => ({ income: inc, occurrence: latestOccurrenceOnOrBefore(inc.dayOfMonth, today) }))
    .filter(
      ({ income, occurrence }) =>
        isOccurrenceValid(occurrence, income.createdAt) ||
        isPaydayConfirmed(incomeReceipts, income.id, occurrence),
    )
    .map(({ occurrence }) => occurrence);

  const periodStart =
    validPastOccurrences.length > 0
      ? new Date(Math.max(...validPastOccurrences.map((d) => d.getTime())))
      : startOfDay(today);
  const periodEnd = new Date(Math.min(...futureOccurrences.map((d) => d.getTime())));

  return { periodStart, periodEnd };
}

/** Sem um parcelamento válido, é uma parcela. Puro: não lança. */
function normalizeInstallments(installments: number | undefined): number {
  if (installments == null || !Number.isInteger(installments) || installments < 1) return 1;
  return installments;
}

/**
 * As parcelas de uma compra, uma por ciclo, a partir do primeiro fechamento em
 * ou depois do dia da compra.
 *
 * O ciclo de cada parcela é re-derivado de (ano, mês, closingDay) a cada passo,
 * nunca somando um mês ao ciclo anterior: com fechamento no dia 31, fevereiro
 * gruda em 28, e somar um mês a esse 28 daria 28/mar em vez de 31/mar — o erro
 * seguiria acumulando mês a mês.
 *
 * A sobra dos centavos vai toda para a primeira parcela: é o que os bancos
 * fazem, e deixa a fatura mais próxima ser a pessimista, o que é o lado certo
 * de errar quando o dinheiro sai neste mês.
 *
 * Exportada para ser testada direto — é onde vivem o arredondamento e o clamp
 * do dia 31, e verificá-los através de seis chamadas de getCardBillsInPeriod
 * esconderia qual dos dois quebrou.
 */
export function installmentSlices(
  purchase: CardPurchaseInput,
  closingDay: number,
): { amount: number; cycleEnd: Date }[] {
  const count = normalizeInstallments(purchase.installments);
  const cents = Math.round(purchase.amount * 100);
  const base = Math.floor(cents / count);
  const remainder = cents - base * count;
  const firstClose = earliestOccurrenceOnOrAfter(closingDay, storedDay(purchase.date));

  return Array.from({ length: count }, (_, i) => {
    const { year, month } = addMonths(firstClose.getFullYear(), firstClose.getMonth(), i);
    return {
      amount: (base + (i === 0 ? remainder : 0)) / 100,
      cycleEnd: dateForDayInMonth(year, month, closingDay),
    };
  });
}

/**
 * Aggregates the credit card bill(s) due within [periodStart, periodEnd),
 * summing purchases from the closing cycle that generated each bill.
 */
export function getCardBillsInPeriod(
  cards: CreditCardInput[],
  purchases: CardPurchaseInput[],
  periodStart: Date,
  periodEnd: Date,
  cardFixedExpenses: FixedExpenseInput[] = [],
): CardBillReminder[] {
  const reminders: CardBillReminder[] = [];

  for (const card of cards) {
    const dueDates = occurrencesInRange(card.dueDay, periodStart, periodEnd);
    for (const dueDate of dueDates) {
      const cycleEnd = latestOccurrenceBefore(card.closingDay, dueDate);

      // Casar a parcela pelo ciclo em que ela fecha, em vez de filtrar a compra
      // pela data, é o que faz um parcelado entrar cem por mês em vez de mil e
      // duzentos de uma vez. Para uma parcela só o resultado é o mesmo de antes:
      // fechamentos consecutivos são estritamente crescentes mesmo com o clamp,
      // então `cycleStart < dia <= cycleEnd` equivale a
      // `cycleEnd = min{fechamento >= dia}`, que é o que installmentSlices usa.
      const purchaseAmount = purchases
        .filter((p) => p.cardId === card.id)
        .flatMap((p) => installmentSlices(p, card.closingDay))
        .filter((slice) => slice.cycleEnd.getTime() === cycleEnd.getTime())
        .reduce((sum, slice) => sum + slice.amount, 0);

      // A card-linked expense has no due day of its own — it's billed on
      // every cycle that closes on or after it was created, same as the
      // card's own due date logic for real purchases.
      const fixedExpenseAmount = cardFixedExpenses
        .filter((exp) => exp.cardId === card.id)
        .filter((exp) => isOccurrenceValid(cycleEnd, exp.createdAt))
        .reduce((sum, exp) => sum + exp.amount, 0);

      const amount = purchaseAmount + fixedExpenseAmount;

      if (amount > 0) {
        reminders.push({ cardId: card.id, dueDate, amount });
      }
    }
  }

  return reminders;
}

export function calculateDailyBudget(input: {
  incomes: IncomeInput[];
  incomeReceipts?: IncomeReceiptInput[];
  fixedExpenses: FixedExpenseInput[];
  creditCards: CreditCardInput[];
  cardPurchases: CardPurchaseInput[];
  expensePayments?: ExpensePaymentInput[];
  transactions: TransactionInput[];
  today: Date;
}): PeriodBudget {
  const {
    incomes,
    incomeReceipts = [],
    fixedExpenses,
    creditCards,
    cardPurchases,
    expensePayments = [],
    transactions,
    today,
  } = input;
  const { periodStart, periodEnd } = getPeriodBounds(incomes, today, incomeReceipts);

  /**
   * The most recent payday each income has already reached. Only the latest
   * one is tracked per income, so months of never confirming don't pile up
   * into a stack of reminders.
   *
   * Unlike the money below, this looks slightly further back than the
   * income's registration date: asking "did this arrive?" about a payday
   * from just before the user set the income up costs nothing, and it's the
   * only way that money can ever be accounted for.
   */
  const arrivedPaydays = incomes
    .map((inc) => ({ income: inc, occurrence: latestOccurrenceOnOrBefore(inc.dayOfMonth, today) }))
    .filter(({ income, occurrence }) => isPaydayAskable(occurrence, income.createdAt));

  /**
   * A payday keeps asking to be confirmed until the user answers, even after
   * a later payday has opened a new period — money that never showed up
   * shouldn't be silently forgotten.
   */
  const incomeReminders: IncomeReminder[] = arrivedPaydays
    .filter(({ income, occurrence }) => !isPaydayConfirmed(incomeReceipts, income.id, occurrence))
    .map(({ income, occurrence }) => ({
      incomeId: income.id,
      dueDate: occurrence,
      amount: income.amount,
    }));

  /**
   * Confirmed money funds the period its payday falls in, at the amount that
   * actually landed. An unconfirmed payday contributes nothing, so a salary
   * that hasn't arrived yet can't inflate the available budget.
   */
  const incomeTotal = incomeReceipts
    .filter((r) => {
      const payday = storedDay(r.occurrenceDate);
      return payday.getTime() >= periodStart.getTime() && payday.getTime() < periodEnd.getTime();
    })
    .reduce((sum, r) => sum + r.amount, 0);

  const standaloneFixedExpenses = fixedExpenses.filter((exp) => !exp.cardId);
  const cardFixedExpenses = fixedExpenses.filter((exp) => exp.cardId);

  /**
   * Toda ocorrência de despesa fixa no período, paga ou não. Os totais saem
   * daqui, não dos lembretes: confirmar um pagamento tira o lembrete da tela
   * mas o dinheiro continua comprometido — se o total caísse junto, o
   * orçamento diário daria um salto na hora do "marcar como paga".
   */
  const fixedExpenseOccurrences = standaloneFixedExpenses.flatMap((exp) => {
    if (exp.dueDay == null) return [];
    return occurrencesInRange(exp.dueDay, periodStart, periodEnd)
      .filter((occ) => isOccurrenceValid(occ, exp.createdAt))
      .map((dueDate) => ({
        expenseId: exp.id,
        dueDate,
        estimate: exp.amount,
        payment: findExpensePayment(expensePayments, { fixedExpenseId: exp.id }, dueDate),
      }));
  });

  const fixedExpenseReminders: FixedExpenseReminder[] = fixedExpenseOccurrences
    .filter((occ) => !occ.payment)
    .map((occ) => ({ expenseId: occ.expenseId, dueDate: occ.dueDate, amount: occ.estimate }));

  const fixedExpenseTotal = fixedExpenseOccurrences.reduce(
    (sum, occ) => sum + (occ.payment ? occ.payment.amount : occ.estimate),
    0,
  );

  const cardBills = getCardBillsInPeriod(
    creditCards,
    cardPurchases,
    periodStart,
    periodEnd,
    cardFixedExpenses,
  );
  const cardBillPayments = cardBills.map((bill) =>
    findExpensePayment(expensePayments, { cardId: bill.cardId }, bill.dueDate),
  );

  const cardBillReminders = cardBills.filter((_, i) => !cardBillPayments[i]);
  const cardBillTotal = cardBills.reduce(
    (sum, bill, i) => sum + (cardBillPayments[i]?.amount ?? bill.amount),
    0,
  );

  const transactionTotal = transactions
    .filter((t) => {
      const day = storedDay(t.date).getTime();
      return day >= periodStart.getTime() && day < periodEnd.getTime();
    })
    .reduce((sum, t) => sum + t.amount, 0);

  const periodBalance = incomeTotal - fixedExpenseTotal - cardBillTotal - transactionTotal;
  const daysRemaining = Math.max(1, diffCalendarDays(periodEnd, today));
  const dailyAvailable = periodBalance / daysRemaining;

  return {
    periodStart,
    periodEnd,
    daysRemaining,
    incomeTotal,
    fixedExpenseTotal,
    cardBillTotal,
    transactionTotal,
    periodBalance,
    dailyAvailable,
    cardBillReminders,
    fixedExpenseReminders,
    incomeReminders,
  };
}

/**
 * The period immediately preceding [periodStart, periodEnd) — used to detect
 * a just-closed period whose leftover hasn't been allocated to a jar yet.
 */
export function getPreviousPeriodBounds(
  incomes: IncomeInput[],
  periodStart: Date,
  incomeReceipts: IncomeReceiptInput[] = [],
): { periodStart: Date; periodEnd: Date } {
  const dayBeforeStart = new Date(periodStart);
  dayBeforeStart.setDate(dayBeforeStart.getDate() - 1);
  return getPeriodBounds(incomes, dayBeforeStart, incomeReceipts);
}
