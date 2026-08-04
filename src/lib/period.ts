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

export interface FixedExpenseInput {
  id: string;
  amount: number;
  dueDay: number;
  /** When omitted, every occurrence is treated as valid (useful for tests). */
  createdAt?: Date;
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
 * The current period's boundaries, derived from every active income's
 * recurring day-of-month. periodStart is the most recent *valid* payday
 * across all sources (ignoring occurrences that predate the income's own
 * creation); periodEnd is the soonest upcoming one (exclusive). If no income
 * has a valid past occurrence yet (e.g. a brand-new income whose first
 * payday hasn't happened), periodStart falls back to today.
 */
export function getPeriodBounds(incomes: IncomeInput[], today: Date): {
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
    .map((inc) => ({ occurrence: latestOccurrenceOnOrBefore(inc.dayOfMonth, today), createdAt: inc.createdAt }))
    .filter(({ occurrence, createdAt }) => isOccurrenceValid(occurrence, createdAt))
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
): CardBillReminder[] {
  const reminders: CardBillReminder[] = [];

  for (const card of cards) {
    const dueDates = occurrencesInRange(card.dueDay, periodStart, periodEnd);
    for (const dueDate of dueDates) {
      const cycleEnd = latestOccurrenceBefore(card.closingDay, dueDate);
      const cycleStart = latestOccurrenceBefore(card.closingDay, cycleEnd);

      const amount = purchases
        .filter((p) => p.cardId === card.id)
        .filter((p) => {
          // Normalize to day granularity: purchase.date carries a time-of-day,
          // while cycleStart/cycleEnd are always midnight.
          const purchaseDay = startOfDay(p.date);
          return purchaseDay.getTime() > cycleStart.getTime() && purchaseDay.getTime() <= cycleEnd.getTime();
        })
        .reduce((sum, p) => sum + p.amount, 0);

      if (amount > 0) {
        reminders.push({ cardId: card.id, dueDate, amount });
      }
    }
  }

  return reminders;
}

export function calculateDailyBudget(input: {
  incomes: IncomeInput[];
  fixedExpenses: FixedExpenseInput[];
  creditCards: CreditCardInput[];
  cardPurchases: CardPurchaseInput[];
  transactions: TransactionInput[];
  today: Date;
}): PeriodBudget {
  const { incomes, fixedExpenses, creditCards, cardPurchases, transactions, today } = input;
  const { periodStart, periodEnd } = getPeriodBounds(incomes, today);

  const incomeTotal = incomes
    .filter((inc) => {
      const occurrence = latestOccurrenceOnOrBefore(inc.dayOfMonth, today);
      return occurrence.getTime() === periodStart.getTime() && isOccurrenceValid(occurrence, inc.createdAt);
    })
    .reduce((sum, inc) => sum + inc.amount, 0);

  const fixedExpenseTotal = fixedExpenses.reduce((sum, exp) => {
    const occurrences = occurrencesInRange(exp.dueDay, periodStart, periodEnd).filter((occ) =>
      isOccurrenceValid(occ, exp.createdAt),
    );
    return sum + occurrences.length * exp.amount;
  }, 0);

  const cardBillReminders = getCardBillsInPeriod(creditCards, cardPurchases, periodStart, periodEnd);
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
  };
}

/**
 * The period immediately preceding [periodStart, periodEnd) — used to detect
 * a just-closed period whose leftover hasn't been allocated to a jar yet.
 */
export function getPreviousPeriodBounds(
  incomes: IncomeInput[],
  periodStart: Date,
): { periodStart: Date; periodEnd: Date } {
  const dayBeforeStart = new Date(periodStart);
  dayBeforeStart.setDate(dayBeforeStart.getDate() - 1);
  return getPeriodBounds(incomes, dayBeforeStart);
}
