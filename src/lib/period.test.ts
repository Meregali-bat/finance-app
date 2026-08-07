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
  const receivedJan1 = [{ incomeId: "i1", occurrenceDate: new Date(2026, 0, 1), amount: 3000 }];

  it("splits the full income evenly with no expenses", () => {
    const today = new Date(2026, 0, 1); // period is exactly Jan 1 - Feb 1 (31 days)
    const result = calculateDailyBudget({
      incomes,
      incomeReceipts: receivedJan1,
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

  it("doesn't count a fixed income's occurrence until it's confirmed received", () => {
    const today = new Date(2026, 0, 1);
    const result = calculateDailyBudget({
      incomes,
      incomeReceipts: [],
      fixedExpenses: [],
      creditCards: [],
      cardPurchases: [],
      transactions: [],
      today,
    });
    expect(result.incomeTotal).toBe(0);
    expect(result.periodBalance).toBe(0);
    expect(result.incomeReminders).toEqual([{ incomeId: "i1", dueDate: new Date(2026, 0, 1), amount: 3000 }]);
  });

  it("uses the confirmed receipt amount instead of the registered amount", () => {
    const today = new Date(2026, 0, 1);
    const result = calculateDailyBudget({
      incomes,
      incomeReceipts: [{ incomeId: "i1", occurrenceDate: new Date(2026, 0, 1), amount: 3200 }],
      fixedExpenses: [],
      creditCards: [],
      cardPurchases: [],
      transactions: [],
      today,
    });
    expect(result.incomeTotal).toBe(3200);
    expect(result.incomeReminders).toEqual([]);
  });

  it("keeps reminding about an unconfirmed payday after a later one opens a new period", () => {
    // Salary on the 6th was never confirmed; on the 16th the insurance
    // payday opens a new period. The salary question is still unanswered,
    // so it must not be silently dropped.
    const twoIncomes = [
      { id: "salary", amount: 4500, dayOfMonth: 6 },
      { id: "insurance", amount: 1900, dayOfMonth: 16 },
    ];
    const result = calculateDailyBudget({
      incomes: twoIncomes,
      incomeReceipts: [],
      fixedExpenses: [],
      creditCards: [],
      cardPurchases: [],
      transactions: [],
      today: new Date(2026, 7, 16),
    });
    expect(result.periodStart).toEqual(new Date(2026, 7, 16));
    expect(result.incomeReminders).toEqual([
      { incomeId: "salary", dueDate: new Date(2026, 7, 6), amount: 4500 },
      { incomeId: "insurance", dueDate: new Date(2026, 7, 16), amount: 1900 },
    ]);
  });

  it("stops reminding once the payday is confirmed", () => {
    const today = new Date(2026, 0, 15);
    const result = calculateDailyBudget({
      incomes,
      incomeReceipts: receivedJan1,
      fixedExpenses: [],
      creditCards: [],
      cardPurchases: [],
      transactions: [],
      today,
    });
    expect(result.incomeReminders).toEqual([]);
  });

  it("counts a confirmed receipt only in the period its payday falls in", () => {
    const twoIncomes = [
      { id: "salary", amount: 4500, dayOfMonth: 6 },
      { id: "insurance", amount: 1900, dayOfMonth: 16 },
    ];
    const receipts = [{ incomeId: "salary", occurrenceDate: new Date(2026, 7, 6), amount: 4500 }];

    const ownPeriod = calculateDailyBudget({
      incomes: twoIncomes,
      incomeReceipts: receipts,
      fixedExpenses: [],
      creditCards: [],
      cardPurchases: [],
      transactions: [],
      today: new Date(2026, 7, 10),
    });
    expect(ownPeriod.incomeTotal).toBe(4500);

    // The Aug 16 period is funded by the insurance payday, not by the
    // salary that already covered Aug 6 - Aug 16.
    const nextPeriod = calculateDailyBudget({
      incomes: twoIncomes,
      incomeReceipts: receipts,
      fixedExpenses: [],
      creditCards: [],
      cardPurchases: [],
      transactions: [],
      today: new Date(2026, 7, 16),
    });
    expect(nextPeriod.incomeTotal).toBe(0);
  });

  it("asks about a payday that landed just before the income was registered", () => {
    // Registered the salary on the 6th, payday is the 5th. The money may well
    // have arrived — the app can't know, so it has to ask rather than pretend
    // the payday never happened.
    const today = new Date(2026, 7, 6);
    const result = calculateDailyBudget({
      incomes: [{ id: "salary", amount: 4500, dayOfMonth: 5, createdAt: today }],
      incomeReceipts: [],
      fixedExpenses: [],
      creditCards: [],
      cardPurchases: [],
      transactions: [],
      today,
    });
    expect(result.incomeReminders).toEqual([
      { incomeId: "salary", dueDate: new Date(2026, 7, 5), amount: 4500 },
    ]);
    // Still nothing in the budget — asking isn't the same as receiving.
    expect(result.incomeTotal).toBe(0);
  });

  it("doesn't ask about a payday from well before the income was registered", () => {
    // Insurance pays on the 16th and was registered on Aug 6. The Jul 16
    // payday belongs to a stretch the app never tracked — dragging it in
    // would invent a period that predates the user's own records.
    const today = new Date(2026, 7, 6);
    const result = calculateDailyBudget({
      incomes: [{ id: "insurance", amount: 1929, dayOfMonth: 16, createdAt: today }],
      incomeReceipts: [],
      fixedExpenses: [],
      creditCards: [],
      cardPurchases: [],
      transactions: [],
      today,
    });
    expect(result.incomeReminders).toEqual([]);
  });

  it("counts a pre-registration payday once the user confirms it arrived", () => {
    const today = new Date(2026, 7, 6);
    const result = calculateDailyBudget({
      incomes: [{ id: "salary", amount: 4500, dayOfMonth: 5, createdAt: today }],
      incomeReceipts: [{ incomeId: "salary", occurrenceDate: new Date(2026, 7, 5), amount: 4500 }],
      fixedExpenses: [],
      creditCards: [],
      cardPurchases: [],
      transactions: [],
      today,
    });
    // Confirmation is first-hand evidence the period really opened on the 5th.
    expect(result.periodStart).toEqual(new Date(2026, 7, 5));
    expect(result.incomeTotal).toBe(4500);
    expect(result.incomeReminders).toEqual([]);
  });

  it("only reminds about an income's most recent payday, not every past one", () => {
    // Two months of never confirming shouldn't pile up two reminders.
    const result = calculateDailyBudget({
      incomes,
      incomeReceipts: [],
      fixedExpenses: [],
      creditCards: [],
      cardPurchases: [],
      transactions: [],
      today: new Date(2026, 2, 15), // March 15; Jan 1, Feb 1 and Mar 1 all passed
    });
    expect(result.incomeReminders).toEqual([
      { incomeId: "i1", dueDate: new Date(2026, 2, 1), amount: 3000 },
    ]);
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
      incomeReceipts: receivedJan1,
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
      incomeReceipts: receivedJan1,
      fixedExpenses: [{ id: "rent", amount: 1200, dueDay: 10, createdAt: today }],
      creditCards: [],
      cardPurchases: [],
      transactions: [],
      today,
    });
    expect(result.fixedExpenseTotal).toBe(1200);
    expect(result.periodBalance).toBe(1800);
  });

  it("exposes fixed expense due dates as reminders", () => {
    const today = new Date(2026, 0, 1);
    const result = calculateDailyBudget({
      incomes,
      fixedExpenses: [{ id: "rent", amount: 1200, dueDay: 10 }],
      creditCards: [],
      cardPurchases: [],
      transactions: [],
      today,
    });
    expect(result.fixedExpenseReminders).toEqual([
      { expenseId: "rent", dueDate: new Date(2026, 0, 10), amount: 1200 },
    ]);
  });

  it("omits a fixed expense reminder whose due date already passed before creation", () => {
    const today = new Date(2026, 0, 20);
    const result = calculateDailyBudget({
      incomes,
      fixedExpenses: [{ id: "netflix", amount: 50, dueDay: 5, createdAt: today }],
      creditCards: [],
      cardPurchases: [],
      transactions: [],
      today,
    });
    expect(result.fixedExpenseReminders).toEqual([]);
  });

  it("reserves fixed expenses from the total up front", () => {
    const today = new Date(2026, 0, 1);
    const result = calculateDailyBudget({
      incomes,
      incomeReceipts: receivedJan1,
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
      incomeReceipts: receivedJan1,
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
      incomeReceipts: receivedJan1,
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
      incomeReceipts: receivedJan1,
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

  it("folds a card-linked fixed expense into the card bill instead of the fixed expense total, with no due day of its own", () => {
    const today = new Date(2026, 0, 1);
    const card = { id: "c1", closingDay: 20, dueDay: 27 };
    const result = calculateDailyBudget({
      incomes,
      fixedExpenses: [{ id: "youtube", amount: 34.9, cardId: "c1" }],
      creditCards: [card],
      cardPurchases: [],
      transactions: [],
      today,
    });
    expect(result.fixedExpenseTotal).toBe(0);
    expect(result.fixedExpenseReminders).toEqual([]);
    expect(result.cardBillTotal).toBe(34.9);
    expect(result.cardBillReminders).toEqual([
      { cardId: "c1", dueDate: new Date(2026, 0, 27), amount: 34.9 },
    ]);
  });

  it("excludes a card-linked fixed expense from a cycle that already closed before it was created", () => {
    const today = new Date(2026, 0, 1);
    const card = { id: "c1", closingDay: 20, dueDay: 27 };
    // This cycle closes Jan 20, but the subscription was only added Jan 25 —
    // after the close — so it shouldn't retroactively bill on Jan 27.
    const result = calculateDailyBudget({
      incomes,
      fixedExpenses: [
        { id: "youtube", amount: 34.9, cardId: "c1", createdAt: new Date(2026, 0, 25) },
      ],
      creditCards: [card],
      cardPurchases: [],
      transactions: [],
      today,
    });
    expect(result.cardBillTotal).toBe(0);
    expect(result.cardBillReminders).toEqual([]);
  });

  it("includes a card-linked fixed expense created before the cycle closes", () => {
    const today = new Date(2026, 0, 1);
    const card = { id: "c1", closingDay: 20, dueDay: 27 };
    const result = calculateDailyBudget({
      incomes,
      fixedExpenses: [
        { id: "youtube", amount: 34.9, cardId: "c1", createdAt: new Date(2026, 0, 10) },
      ],
      creditCards: [card],
      cardPurchases: [],
      transactions: [],
      today,
    });
    expect(result.cardBillTotal).toBe(34.9);
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

  it("adds a card-linked fixed expense's occurrence to the purchases in the same cycle", () => {
    const purchase = { cardId: "c1", amount: 100, date: new Date(2026, 0, 15) };
    const subscription = { id: "youtube", amount: 34.9, cardId: "c1" };

    const result = getCardBillsInPeriod(
      [card],
      [purchase],
      new Date(2026, 0, 1),
      new Date(2026, 1, 1),
      [subscription],
    );
    expect(result).toEqual([{ cardId: "c1", dueDate: new Date(2026, 0, 27), amount: 134.9 }]);
  });

  it("ignores a fixed expense linked to a different card", () => {
    const subscription = { id: "youtube", amount: 34.9, cardId: "other-card" };
    const result = getCardBillsInPeriod(
      [card],
      [],
      new Date(2026, 0, 1),
      new Date(2026, 1, 1),
      [subscription],
    );
    expect(result).toEqual([]);
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

describe("calculateDailyBudget com pagamentos confirmados", () => {
  const baseInput = {
    incomes: [{ id: "i1", amount: 3000, dayOfMonth: 5 }],
    incomeReceipts: [{ incomeId: "i1", occurrenceDate: new Date(2026, 0, 5), amount: 3000 }],
    creditCards: [],
    cardPurchases: [],
    transactions: [],
    today: new Date(2026, 0, 10),
  };

  it("tira a despesa fixa paga dos lembretes", () => {
    const budget = calculateDailyBudget({
      ...baseInput,
      fixedExpenses: [{ id: "e1", amount: 500, dueDay: 20 }],
      expensePayments: [{ fixedExpenseId: "e1", dueDate: new Date(2026, 0, 20), amount: 500 }],
    });
    expect(budget.fixedExpenseReminders).toEqual([]);
  });

  it("mantém a despesa fixa paga no total do período", () => {
    // Confirmar o pagamento não devolve dinheiro: o valor já estava reservado.
    const unpaid = calculateDailyBudget({
      ...baseInput,
      fixedExpenses: [{ id: "e1", amount: 500, dueDay: 20 }],
    });
    const paid = calculateDailyBudget({
      ...baseInput,
      fixedExpenses: [{ id: "e1", amount: 500, dueDay: 20 }],
      expensePayments: [{ fixedExpenseId: "e1", dueDate: new Date(2026, 0, 20), amount: 500 }],
    });
    expect(paid.fixedExpenseTotal).toBe(500);
    expect(paid.periodBalance).toBe(unpaid.periodBalance);
  });

  it("usa o valor pago no lugar da estimativa quando eles diferem", () => {
    const budget = calculateDailyBudget({
      ...baseInput,
      fixedExpenses: [{ id: "e1", amount: 500, dueDay: 20 }],
      expensePayments: [{ fixedExpenseId: "e1", dueDate: new Date(2026, 0, 20), amount: 620 }],
    });
    expect(budget.fixedExpenseTotal).toBe(620);
    expect(budget.periodBalance).toBe(3000 - 620);
  });

  it("não confunde o pagamento de uma ocorrência com o de outro mês", () => {
    const budget = calculateDailyBudget({
      ...baseInput,
      fixedExpenses: [{ id: "e1", amount: 500, dueDay: 20 }],
      // Pagamento do vencimento de dezembro, não o de janeiro.
      expensePayments: [{ fixedExpenseId: "e1", dueDate: new Date(2025, 11, 20), amount: 500 }],
    });
    expect(budget.fixedExpenseReminders).toHaveLength(1);
    expect(budget.fixedExpenseReminders[0].dueDate).toEqual(new Date(2026, 0, 20));
  });

  it("ignora a hora do dia ao casar o pagamento com a ocorrência", () => {
    const budget = calculateDailyBudget({
      ...baseInput,
      fixedExpenses: [{ id: "e1", amount: 500, dueDay: 20 }],
      expensePayments: [
        { fixedExpenseId: "e1", dueDate: new Date(2026, 0, 20, 15, 30), amount: 500 },
      ],
    });
    expect(budget.fixedExpenseReminders).toEqual([]);
  });

  it("tira a fatura paga dos lembretes sem mexer no total", () => {
    const input = {
      ...baseInput,
      fixedExpenses: [],
      creditCards: [{ id: "c1", closingDay: 28, dueDay: 8 }],
      // Dentro do ciclo (28/nov, 28/dez] que gera a fatura vencendo em 8/jan.
      cardPurchases: [{ cardId: "c1", amount: 200, date: new Date(2025, 11, 20) }],
      today: new Date(2026, 0, 6),
    };
    const unpaid = calculateDailyBudget(input);
    expect(unpaid.cardBillReminders).toHaveLength(1);

    const paid = calculateDailyBudget({
      ...input,
      expensePayments: [
        { cardId: "c1", dueDate: unpaid.cardBillReminders[0].dueDate, amount: 200 },
      ],
    });
    expect(paid.cardBillReminders).toEqual([]);
    expect(paid.cardBillTotal).toBe(unpaid.cardBillTotal);
  });

  it("não deixa o pagamento de uma despesa fixa quitar a fatura de um cartão de mesmo id", () => {
    // fixedExpenseId e cardId vivem em espaços de id diferentes; casar só por
    // data quitaria a coisa errada.
    const budget = calculateDailyBudget({
      ...baseInput,
      fixedExpenses: [{ id: "x", amount: 500, dueDay: 20 }],
      expensePayments: [{ cardId: "x", dueDate: new Date(2026, 0, 20), amount: 500 }],
    });
    expect(budget.fixedExpenseReminders).toHaveLength(1);
  });
});
