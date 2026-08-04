import { describe, expect, it } from "vitest";
import {
  calculateDailyBudget,
  getCardBillsInPeriod,
  getPeriodBounds,
  getPreviousPeriodBounds,
} from "./period";

describe("getPeriodBounds", () => {
  it("finds the current period for a single monthly income", () => {
    const today = new Date(2026, 0, 15); // Jan 15
    const { periodStart, periodEnd } = getPeriodBounds(
      [{ id: "i1", amount: 3000, dayOfMonth: 5 }],
      today,
    );
    expect(periodStart).toEqual(new Date(2026, 0, 5));
    expect(periodEnd).toEqual(new Date(2026, 1, 5));
  });

  it("combines multiple income sources into shorter periods", () => {
    const today = new Date(2026, 0, 10); // Jan 10, between day-5 and day-20 paydays
    const incomes = [
      { id: "salary", amount: 3000, dayOfMonth: 5 },
      { id: "freela", amount: 800, dayOfMonth: 20 },
    ];
    const { periodStart, periodEnd } = getPeriodBounds(incomes, today);
    expect(periodStart).toEqual(new Date(2026, 0, 5));
    expect(periodEnd).toEqual(new Date(2026, 0, 20));
  });

  it("treats today as periodStart when it is payday", () => {
    const today = new Date(2026, 0, 5);
    const { periodStart, periodEnd } = getPeriodBounds(
      [{ id: "i1", amount: 3000, dayOfMonth: 5 }],
      today,
    );
    expect(periodStart).toEqual(today);
    expect(periodEnd).toEqual(new Date(2026, 1, 5));
  });

  it("clamps day-of-month 31 to the last day of shorter months", () => {
    const today = new Date(2026, 1, 20); // Feb 20 2026 (28-day Feb)
    const { periodEnd } = getPeriodBounds([{ id: "i1", amount: 100, dayOfMonth: 31 }], today);
    expect(periodEnd).toEqual(new Date(2026, 1, 28));
  });

  it("doesn't invent a past payday for an income created after that day already passed", () => {
    // Registered today (Jan 20) with payday on the 5th — the 5th already
    // happened this month, but this income didn't exist yet to count it.
    const today = new Date(2026, 0, 20);
    const { periodStart, periodEnd } = getPeriodBounds(
      [{ id: "i1", amount: 3000, dayOfMonth: 5, createdAt: today }],
      today,
    );
    expect(periodStart).toEqual(today);
    expect(periodEnd).toEqual(new Date(2026, 1, 5));
  });

  it("only starts counting from the next occurrence when registered right before payday", () => {
    // User's exact scenario: registers salary today (Jan 4), paid tomorrow (Jan 5).
    const today = new Date(2026, 0, 4);
    const { periodStart, periodEnd } = getPeriodBounds(
      [{ id: "i1", amount: 9000, dayOfMonth: 5, createdAt: today }],
      today,
    );
    expect(periodStart).toEqual(today);
    expect(periodEnd).toEqual(new Date(2026, 0, 5));
  });

  it("keeps using an established income's history when a brand-new income is added alongside it", () => {
    const today = new Date(2026, 0, 20);
    const incomes = [
      { id: "salary", amount: 3000, dayOfMonth: 5, createdAt: new Date(2025, 5, 1) }, // long-standing
      { id: "freela", amount: 800, dayOfMonth: 10, createdAt: today }, // just added, day 10 already passed
    ];
    const { periodStart, periodEnd } = getPeriodBounds(incomes, today);
    expect(periodStart).toEqual(new Date(2026, 0, 5)); // from the established salary, not today
    expect(periodEnd).toEqual(new Date(2026, 1, 5)); // freela's next Jan-10 occurrence is skipped (invalid)
  });
});

describe("calculateDailyBudget", () => {
  const incomes = [{ id: "i1", amount: 3000, dayOfMonth: 1 }];

  it("splits the full income evenly with no expenses", () => {
    const today = new Date(2026, 0, 1); // period is exactly Jan 1 - Feb 1 (31 days)
    const result = calculateDailyBudget({
      incomes,
      fixedExpenses: [],
      creditCards: [],
      cardPurchases: [],
      transactions: [],
      today,
    });
    expect(result.periodBalance).toBe(3000);
    expect(result.daysRemaining).toBe(31);
    expect(result.dailyAvailable).toBeCloseTo(3000 / 31);
  });

  it("doesn't count an income registered today toward today's balance if payday is tomorrow", () => {
    const today = new Date(2026, 0, 4);
    const result = calculateDailyBudget({
      incomes: [{ id: "i1", amount: 9000, dayOfMonth: 5, createdAt: today }],
      fixedExpenses: [],
      creditCards: [],
      cardPurchases: [],
      transactions: [],
      today,
    });
    expect(result.incomeTotal).toBe(0);
    expect(result.periodBalance).toBe(0);
    expect(result.periodEnd).toEqual(new Date(2026, 0, 5));
  });

  it("excludes a fixed expense's due date if it already passed before the expense was created", () => {
    const today = new Date(2026, 0, 20);
    const result = calculateDailyBudget({
      incomes,
      fixedExpenses: [{ id: "netflix", amount: 50, dueDay: 5, createdAt: today }],
      creditCards: [],
      cardPurchases: [],
      transactions: [],
      today,
    });
    expect(result.fixedExpenseTotal).toBe(0);
    expect(result.periodBalance).toBe(3000);
  });

  it("still counts a fixed expense's due date this period if it hasn't happened yet", () => {
    const today = new Date(2026, 0, 1);
    const result = calculateDailyBudget({
      incomes,
      fixedExpenses: [{ id: "rent", amount: 1200, dueDay: 10, createdAt: today }],
      creditCards: [],
      cardPurchases: [],
      transactions: [],
      today,
    });
    expect(result.fixedExpenseTotal).toBe(1200);
    expect(result.periodBalance).toBe(1800);
  });

  it("reserves fixed expenses from the total up front", () => {
    const today = new Date(2026, 0, 1);
    const result = calculateDailyBudget({
      incomes,
      fixedExpenses: [{ id: "rent", amount: 1200, dueDay: 10 }],
      creditCards: [],
      cardPurchases: [],
      transactions: [],
      today,
    });
    expect(result.periodBalance).toBe(1800);
  });

  it("redistributes remaining days after an overspend", () => {
    const today = new Date(2026, 0, 1);
    const base = {
      incomes,
      fixedExpenses: [],
      creditCards: [],
      cardPurchases: [],
    };
    const day1 = calculateDailyBudget({ ...base, transactions: [], today });
    expect(day1.dailyAvailable).toBeCloseTo(3000 / 31);

    // Spend far more than one day's share on day 1.
    const nextDay = new Date(2026, 0, 2);
    const day2 = calculateDailyBudget({
      ...base,
      transactions: [{ amount: 500, date: today }],
      today: nextDay,
    });
    // Balance drops by the overspend, days remaining drops by one -> lower daily rate.
    expect(day2.periodBalance).toBe(2500);
    expect(day2.daysRemaining).toBe(30);
    expect(day2.dailyAvailable).toBeCloseTo(2500 / 30);
    expect(day2.dailyAvailable).toBeLessThan(day1.dailyAvailable);
  });

  it("does not let a card purchase affect the current period when its bill is due next period", () => {
    const today = new Date(2026, 0, 1);
    const card = { id: "c1", closingDay: 20, dueDay: 27 };
    const withoutCard = calculateDailyBudget({
      incomes,
      fixedExpenses: [],
      creditCards: [],
      cardPurchases: [],
      transactions: [],
      today,
    });
    // Purchased after this cycle's Jan-20 close, so it bills on Feb 27 (next period).
    const withCardPurchase = calculateDailyBudget({
      incomes,
      fixedExpenses: [],
      creditCards: [card],
      cardPurchases: [{ cardId: "c1", amount: 200, date: new Date(2026, 0, 25) }],
      transactions: [],
      today,
    });
    expect(withCardPurchase.dailyAvailable).toBe(withoutCard.dailyAvailable);
  });

  it("reserves a card bill from day one of the period it's due in, like a fixed expense", () => {
    const today = new Date(2026, 0, 1);
    const card = { id: "c1", closingDay: 20, dueDay: 27 };
    // Purchased before this cycle's Jan-20 close, so it bills on Jan 27 (this period).
    const result = calculateDailyBudget({
      incomes,
      fixedExpenses: [],
      creditCards: [card],
      cardPurchases: [{ cardId: "c1", amount: 200, date: new Date(2026, 0, 5) }],
      transactions: [],
      today,
    });
    expect(result.cardBillTotal).toBe(200);
    expect(result.periodBalance).toBe(2800);
  });

  it("subtracts the card bill only in the period its due date falls in", () => {
    const card = { id: "c1", closingDay: 20, dueDay: 27 };
    // Purchase on Jan 10 closes in the cycle ending Jan 20, bill due Jan 27.
    const purchase = { cardId: "c1", amount: 200, date: new Date(2026, 0, 10) };

    const beforeDue = calculateDailyBudget({
      incomes,
      fixedExpenses: [],
      creditCards: [card],
      cardPurchases: [purchase],
      transactions: [],
      today: new Date(2026, 0, 15),
    });
    expect(beforeDue.cardBillTotal).toBe(200);
    expect(beforeDue.periodBalance).toBe(2800);

    const afterDue = calculateDailyBudget({
      incomes,
      fixedExpenses: [],
      creditCards: [card],
      cardPurchases: [purchase],
      transactions: [],
      today: new Date(2026, 1, 5), // next period, bill already resolved
    });
    expect(afterDue.cardBillTotal).toBe(0);
  });
});

describe("getCardBillsInPeriod", () => {
  const card = { id: "c1", closingDay: 20, dueDay: 27 };

  it("assigns a purchase to the cycle that closes after it", () => {
    const purchaseBeforeClose = { cardId: "c1", amount: 100, date: new Date(2026, 0, 15) };
    const purchaseAfterClose = { cardId: "c1", amount: 50, date: new Date(2026, 0, 25) };

    const januaryBillPeriod = getCardBillsInPeriod(
      [card],
      [purchaseBeforeClose, purchaseAfterClose],
      new Date(2026, 0, 1),
      new Date(2026, 1, 1),
    );
    expect(januaryBillPeriod).toEqual([
      { cardId: "c1", dueDate: new Date(2026, 0, 27), amount: 100 },
    ]);

    const februaryBillPeriod = getCardBillsInPeriod(
      [card],
      [purchaseBeforeClose, purchaseAfterClose],
      new Date(2026, 1, 1),
      new Date(2026, 2, 1),
    );
    expect(februaryBillPeriod).toEqual([
      { cardId: "c1", dueDate: new Date(2026, 1, 27), amount: 50 },
    ]);
  });

  it("omits cards with no purchases in the cycle", () => {
    const result = getCardBillsInPeriod([card], [], new Date(2026, 0, 1), new Date(2026, 1, 1));
    expect(result).toEqual([]);
  });

  it("counts a purchase made today even with a non-midnight timestamp", () => {
    // Regression test: purchase.date carries a real time-of-day (e.g. 17:32),
    // while cycle boundaries are always midnight — the closing-day comparison
    // must operate at day granularity, not exact instants.
    const purchaseToday = {
      cardId: "c1",
      amount: 150,
      date: new Date(2026, 0, 20, 17, 32, 0),
    };
    const result = getCardBillsInPeriod(
      [card],
      [purchaseToday],
      new Date(2026, 0, 20),
      new Date(2026, 1, 20),
    );
    expect(result).toEqual([{ cardId: "c1", dueDate: new Date(2026, 0, 27), amount: 150 }]);
  });
});

describe("getPreviousPeriodBounds", () => {
  it("returns the period that just closed", () => {
    const incomes = [{ id: "i1", amount: 3000, dayOfMonth: 5 }];
    const currentStart = new Date(2026, 1, 5); // Feb 5
    const { periodStart, periodEnd } = getPreviousPeriodBounds(incomes, currentStart);
    expect(periodStart).toEqual(new Date(2026, 0, 5));
    expect(periodEnd).toEqual(new Date(2026, 1, 5));
  });
});
