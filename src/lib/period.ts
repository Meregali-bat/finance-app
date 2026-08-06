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
  amount: number;
  date: Date;
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

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
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
    (r) => r.incomeId === incomeId && startOfDay(r.occurrenceDate).getTime() === occurrence.getTime(),
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
      const cycleStart = latestOccurrenceBefore(card.closingDay, cycleEnd);

      const purchaseAmount = purchases
        .filter((p) => p.cardId === card.id)
        .filter((p) => {
          // Normalize to day granularity: purchase.date carries a time-of-day,
          // while cycleStart/cycleEnd are always midnight.
          const purchaseDay = startOfDay(p.date);
          return purchaseDay.getTime() > cycleStart.getTime() && purchaseDay.getTime() <= cycleEnd.getTime();
        })
        .reduce((sum, p) => sum + p.amount, 0);

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
  transactions: TransactionInput[];
  today: Date;
}): PeriodBudget {
  const { incomes, incomeReceipts = [], fixedExpenses, creditCards, cardPurchases, transactions, today } = input;
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
      const payday = startOfDay(r.occurrenceDate);
      return payday.getTime() >= periodStart.getTime() && payday.getTime() < periodEnd.getTime();
    })
    .reduce((sum, r) => sum + r.amount, 0);

  const standaloneFixedExpenses = fixedExpenses.filter((exp) => !exp.cardId);
  const cardFixedExpenses = fixedExpenses.filter((exp) => exp.cardId);

  const fixedExpenseReminders: FixedExpenseReminder[] = standaloneFixedExpenses.flatMap((exp) => {
    if (exp.dueDay == null) return [];
    const occurrences = occurrencesInRange(exp.dueDay, periodStart, periodEnd).filter((occ) =>
      isOccurrenceValid(occ, exp.createdAt),
    );
    return occurrences.map((dueDate) => ({ expenseId: exp.id, dueDate, amount: exp.amount }));
  });
  const fixedExpenseTotal = fixedExpenseReminders.reduce((sum, r) => sum + r.amount, 0);

  const cardBillReminders = getCardBillsInPeriod(
    creditCards,
    cardPurchases,
    periodStart,
    periodEnd,
    cardFixedExpenses,
  );
  const cardBillTotal = cardBillReminders.reduce((sum, r) => sum + r.amount, 0);

  const transactionTotal = transactions
    .filter((t) => t.date.getTime() >= periodStart.getTime() && t.date.getTime() < periodEnd.getTime())
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
