import { describe, expect, it } from "vitest";
import {
  calculateDailyBudget,
  getCardBillsInPeriod,
  getNextPeriodBounds,
  getPeriodBounds,
  getPreviousPeriodBounds,
  installmentSlices,
  buildCardBills,
  getCardLimitUsage,
  findNextOpenBill,
  buildCardBillSeries,
  cardBillFixedExpenses,
  fallsOnDay,
  type CardBill,
} from "./period";

/**
 * Um dia de calendário como o banco guarda: a intenção mora na parte UTC.
 *
 * As suítes mais antigas deste arquivo montam essas datas em horário local, o
 * que funciona só porque elas escolhem dias longe da borda do ciclo. Onde a
 * comparação é de igualdade exata de dia — o vencimento de uma previsão, o
 * fechamento de uma parcela — local não serve: new Date(2026, 0, 27) em fuso
 * positivo é 2026-01-26T22:00Z, e storedDay() leria dia 26.
 *
 * Para o que é instante de verdade (today, createdAt, periodStart/periodEnd) e
 * para os valores ESPERADOS continua valendo new Date(y, m, d) local, porque é
 * meia-noite local que dateForDayInMonth devolve.
 */
const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

/**
 * Só os lembretes do próprio período. Os vencidos do período anterior têm
 * suíte própria; as suítes antigas pagam apenas a ocorrência corrente e
 * querem saber dela.
 */
const current = <T extends { overdue?: boolean }>(reminders: T[]) =>
  reminders.filter((r) => !r.overdue);

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
    expect(current(result.fixedExpenseReminders)).toEqual([
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
    expect(current(result.cardBillReminders)).toEqual([
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

  it("soma a previsão manual à fatura do período", () => {
    const estimates = [{ cardId: "c1", dueDate: day(2026, 0, 27), amount: 700 }];
    const bills = getCardBillsInPeriod(
      [card],
      [],
      new Date(2026, 0, 21),
      new Date(2026, 1, 21),
      [],
      estimates,
    );
    expect(bills).toEqual([{ cardId: "c1", dueDate: new Date(2026, 0, 27), amount: 700 }]);
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

describe("compras parceladas", () => {
  // Cartão que fecha dia 20 e vence dia 27.
  const card = { id: "c1", closingDay: 20, dueDay: 27 };

  it("trata uma compra sem parcelas como uma parcela única no ciclo da compra", () => {
    // A regressão que importa: `installments` ausente tem que dar exatamente a
    // mesma resposta de antes deste campo existir.
    const purchases = [{ cardId: "c1", amount: 300, date: day(2026, 0, 15) }];
    const bills = getCardBillsInPeriod(
      [card],
      purchases,
      new Date(2026, 0, 21),
      new Date(2026, 1, 21),
    );
    expect(bills).toEqual([{ cardId: "c1", dueDate: new Date(2026, 0, 27), amount: 300 }]);
  });

  it("divide o total em parcelas iguais, uma por ciclo", () => {
    const purchases = [{ cardId: "c1", amount: 1200, date: day(2026, 0, 15), installments: 12 }];
    // A compra de 15/jan fecha no ciclo de 20/jan, que vence em 27/jan.
    const jan = getCardBillsInPeriod([card], purchases, new Date(2026, 0, 21), new Date(2026, 1, 21));
    const fev = getCardBillsInPeriod([card], purchases, new Date(2026, 1, 21), new Date(2026, 2, 21));
    expect(jan[0].amount).toBe(100);
    expect(fev[0].amount).toBe(100);
  });

  it("coloca a primeira parcela no ciclo que fecha depois da compra", () => {
    // Comprou 25/jan, depois do fechamento do dia 20: cai na fatura de fevereiro.
    const purchases = [{ cardId: "c1", amount: 400, date: day(2026, 0, 25), installments: 2 }];
    const jan = getCardBillsInPeriod([card], purchases, new Date(2026, 0, 21), new Date(2026, 1, 21));
    const fev = getCardBillsInPeriod([card], purchases, new Date(2026, 1, 21), new Date(2026, 2, 21));
    expect(jan).toEqual([]);
    expect(fev[0].amount).toBe(200);
  });

  it("manda a sobra dos centavos para a primeira parcela", () => {
    // 1000 em 3x não fecha: alguém tem que levar o centavo a mais. Vai para a
    // primeira porque é assim que os bancos fazem, e porque deixa a fatura mais
    // próxima ser a pessimista.
    const slices = installmentSlices(
      { cardId: "c1", amount: 1000, date: day(2026, 0, 15), installments: 3 },
      20,
    );
    expect(slices.map((s) => s.amount)).toEqual([333.34, 333.33, 333.33]);
  });

  it.each([
    [1000, 3],
    [100, 3],
    [0.05, 3],
    [1234.56, 7],
  ])("faz as parcelas de %s em %ix somarem exatamente o total", (total, count) => {
    // Comparado em centavos inteiros de propósito: toBeCloseTo esconderia
    // justamente o erro de arredondamento que este teste existe para pegar.
    const slices = installmentSlices(
      { cardId: "c1", amount: total, date: day(2026, 0, 15), installments: count },
      20,
    );
    const sum = slices.reduce((acc, s) => acc + Math.round(s.amount * 100), 0);
    expect(sum).toBe(Math.round(total * 100));
  });

  it("não deixa o fechamento no dia 31 escorregar ao passar por fevereiro", () => {
    // Fevereiro fecha dia 28. Se o próximo ciclo fosse calculado somando um mês
    // ao 28 já grudado, março fecharia dia 28 em vez de 31 — e o erro seguiria
    // acumulando mês a mês.
    const slices = installmentSlices(
      { cardId: "c2", amount: 400, date: day(2026, 0, 15), installments: 4 },
      31,
    );
    expect(slices.map((s) => s.cycleEnd)).toEqual([
      new Date(2026, 0, 31),
      new Date(2026, 1, 28),
      new Date(2026, 2, 31),
      new Date(2026, 3, 30),
    ]);
  });

  it.each([[0], [-3], [2.5]])("ignora um número de parcelas inválido (%s)", (installments) => {
    // period.ts é puro e não lança: a validação de verdade é do zod na action.
    const purchases = [{ cardId: "c1", amount: 300, date: day(2026, 0, 15), installments }];
    const bills = getCardBillsInPeriod(
      [card],
      purchases,
      new Date(2026, 0, 21),
      new Date(2026, 1, 21),
    );
    expect(bills[0].amount).toBe(300);
  });
});

describe("buildCardBills", () => {
  const card = { id: "c1", closingDay: 20, dueDay: 27 };

  it("devolve uma fatura por vencimento, em ordem, pelos meses pedidos", () => {
    // occurrencesInRange nunca conseguiu isso: ele só varre start-1, start e
    // start+1, então seis meses estavam fora de alcance.
    const bills = buildCardBills({ card, purchases: [], from: new Date(2026, 0, 1), months: 6 });
    expect(bills.map((b) => b.dueDate)).toEqual([
      new Date(2026, 0, 27),
      new Date(2026, 1, 27),
      new Date(2026, 2, 27),
      new Date(2026, 3, 27),
      new Date(2026, 4, 27),
      new Date(2026, 5, 27),
    ]);
  });

  it("atravessa a virada do ano sem repetir vencimento", () => {
    const bills = buildCardBills({ card, purchases: [], from: new Date(2026, 10, 1), months: 4 });
    expect(bills.map((b) => b.dueDate)).toEqual([
      new Date(2026, 10, 27),
      new Date(2026, 11, 27),
      new Date(2027, 0, 27),
      new Date(2027, 1, 27),
    ]);
  });

  it("mantém o dia do vencimento colado no mês, sem escorregar", () => {
    const card31 = { id: "c2", closingDay: 10, dueDay: 31 };
    const bills = buildCardBills({
      card: card31,
      purchases: [],
      from: new Date(2026, 0, 1),
      months: 4,
    });
    expect(bills.map((b) => b.dueDate)).toEqual([
      new Date(2026, 0, 31),
      new Date(2026, 1, 28),
      new Date(2026, 2, 31),
      new Date(2026, 3, 30),
    ]);
  });

  it("devolve fatura zerada nos meses sem nada", () => {
    // Ao contrário de getCardBillsInPeriod, que omite as vazias: uma projeção
    // que pula mês desalinha a linha do tempo na tela.
    const bills = buildCardBills({ card, purchases: [], from: new Date(2026, 0, 1), months: 3 });
    expect(bills).toHaveLength(3);
    expect(bills.every((b) => b.amount === 0)).toBe(true);
  });

  it("marca a fatura como paga e guarda o valor realmente pago", () => {
    const purchases = [{ cardId: "c1", amount: 300, date: day(2026, 0, 15) }];
    const payments = [{ cardId: "c1", dueDate: day(2026, 0, 27), amount: 290 }];
    const [bill] = buildCardBills({
      card,
      purchases,
      expensePayments: payments,
      from: new Date(2026, 0, 1),
      months: 1,
    });
    expect(bill.paid).toBe(true);
    expect(bill.paidAmount).toBe(290);
    // O previsto não muda: quem aplica o valor pago é quem consome a fatura.
    expect(bill.amount).toBe(300);
  });

  it("soma a previsão manual ao que as compras já calculam, sem substituir", () => {
    const purchases = [{ cardId: "c1", amount: 200, date: day(2026, 0, 15) }];
    const estimates = [{ cardId: "c1", dueDate: day(2026, 0, 27), amount: 800 }];
    const [bill] = buildCardBills({
      card,
      purchases,
      billEstimates: estimates,
      from: new Date(2026, 0, 1),
      months: 1,
    });
    expect(bill.amount).toBe(1000);
  });

  it("separa quanto veio de compra, de assinatura e de previsão", () => {
    const [bill] = buildCardBills({
      card,
      purchases: [{ cardId: "c1", amount: 200, date: day(2026, 0, 15) }],
      // createdAt é instante de verdade, por isso local.
      cardFixedExpenses: [{ id: "f1", amount: 50, cardId: "c1", createdAt: new Date(2025, 11, 1) }],
      billEstimates: [{ cardId: "c1", dueDate: day(2026, 0, 27), amount: 800 }],
      from: new Date(2026, 0, 1),
      months: 1,
    });
    expect(bill).toMatchObject({
      purchaseAmount: 200,
      fixedExpenseAmount: 50,
      estimateAmount: 800,
      amount: 1050,
    });
  });

  it("casa a previsão pelo dia do vencimento, ignorando a hora", () => {
    // Mesma armadilha de findExpensePayment: o banco grava meia-noite do fuso de
    // quem gravou, então o dia pretendido está na parte UTC.
    const estimates = [{ cardId: "c1", dueDate: new Date(Date.UTC(2026, 0, 27, 3, 0)), amount: 500 }];
    const [bill] = buildCardBills({
      card,
      purchases: [],
      billEstimates: estimates,
      from: new Date(2026, 0, 1),
      months: 1,
    });
    expect(bill.estimateAmount).toBe(500);
  });

  it("ignora previsão e compra de outro cartão", () => {
    const [bill] = buildCardBills({
      card,
      purchases: [{ cardId: "outro", amount: 200, date: day(2026, 0, 15) }],
      billEstimates: [{ cardId: "outro", dueDate: day(2026, 0, 27), amount: 800 }],
      from: new Date(2026, 0, 1),
      months: 1,
    });
    expect(bill.amount).toBe(0);
  });
});

describe("getCardLimitUsage", () => {
  const card = { id: "c1", closingDay: 20, dueDay: 27, creditLimit: 5000 };
  const today = new Date(2026, 2, 10); // 10/mar/2026

  it("devolve nulo quando o cartão não tem limite informado", () => {
    const usage = getCardLimitUsage({
      card: { id: "c1", closingDay: 20, dueDay: 27 },
      purchases: [],
      today,
    });
    expect(usage).toBeNull();
  });

  it("soma as faturas em aberto e as parcelas futuras no usado", () => {
    const purchases = [
      { cardId: "c1", amount: 900, date: day(2026, 1, 15) }, // fatura de 27/fev
      { cardId: "c1", amount: 1200, date: day(2026, 2, 5), installments: 4 }, // 300 x4
    ];
    const usage = getCardLimitUsage({ card, purchases, today })!;
    expect(usage.used).toBe(2100);
    expect(usage.available).toBe(2900);
  });

  it("libera o limite quando a fatura é marcada como paga", () => {
    const purchases = [{ cardId: "c1", amount: 900, date: day(2026, 1, 15) }];
    const payments = [{ cardId: "c1", dueDate: day(2026, 1, 27), amount: 900 }];
    const usage = getCardLimitUsage({ card, purchases, expensePayments: payments, today })!;
    expect(usage.used).toBe(0);
    expect(usage.available).toBe(5000);
  });

  it("alcança a última parcela de um parcelado de 18x", () => {
    // O horizonte é derivado das parcelas: com uma janela fixa de seis meses,
    // dois terços do comprometido ficariam invisíveis.
    const purchases = [{ cardId: "c1", amount: 1800, date: day(2026, 2, 5), installments: 18 }];
    const usage = getCardLimitUsage({ card, purchases, today })!;
    expect(usage.used).toBe(1800);
  });

  it("conta a fatura vencida no mês passado que ainda não foi paga", () => {
    const purchases = [{ cardId: "c1", amount: 400, date: day(2026, 1, 15) }];
    const usage = getCardLimitUsage({ card, purchases, today })!;
    expect(usage.used).toBe(400);
    expect(usage.overdueBillCount).toBe(1);
  });

  it("esquece a fatura vencida há mais de três meses que nunca foi marcada como paga", () => {
    // Compra de 15/out/2025: a fatura venceu em 27/out, e a janela do limite só
    // começa no primeiro vencimento em ou depois de 10/dez/2025 — ou seja,
    // 27/dez. Uma fatura tão antiga quase certamente foi paga e só não foi
    // marcada; mantê-la comeria o limite para sempre.
    const purchases = [{ cardId: "c1", amount: 400, date: day(2025, 9, 15) }];
    const usage = getCardLimitUsage({ card, purchases, today })!;
    expect(usage.used).toBe(0);
    expect(usage.overdueBillCount).toBe(0);
  });

  it("não deixa o disponível ficar negativo quando o comprometido passa do limite", () => {
    const purchases = [{ cardId: "c1", amount: 8000, date: day(2026, 1, 15) }];
    const usage = getCardLimitUsage({ card, purchases, today })!;
    expect(usage.available).toBe(0);
    expect(usage.percentUsed).toBe(100);
  });

  it("conta a previsão manual no comprometido", () => {
    const estimates = [{ cardId: "c1", dueDate: day(2026, 3, 27), amount: 600 }];
    const usage = getCardLimitUsage({ card, purchases: [], billEstimates: estimates, today })!;
    expect(usage.used).toBe(600);
  });

  it("conta a assinatura cobrada no cartão", () => {
    const usage = getCardLimitUsage({
      card,
      purchases: [],
      cardFixedExpenses: [{ id: "f1", amount: 34.9, cardId: "c1", createdAt: new Date(2026, 0, 1) }],
      today,
    })!;
    // Uma assinatura entra em todo ciclo da janela, não só em um.
    expect(usage.used).toBeGreaterThan(34.9);
  });
});

describe("findNextOpenBill", () => {
  const bill = (overrides: Partial<CardBill> = {}): CardBill => ({
    cardId: "c1",
    dueDate: new Date(2026, 0, 27),
    cycleStart: new Date(2025, 11, 20),
    cycleEnd: new Date(2026, 0, 20),
    amount: 100,
    purchaseAmount: 100,
    fixedExpenseAmount: 0,
    estimateAmount: 0,
    paid: false,
    ...overrides,
  });

  it("devolve a primeira fatura que ainda cobra algo", () => {
    const bills = [
      bill({ dueDate: new Date(2026, 0, 27), amount: 0, purchaseAmount: 0 }),
      bill({ dueDate: new Date(2026, 1, 27), amount: 250 }),
      bill({ dueDate: new Date(2026, 2, 27), amount: 400 }),
    ];
    expect(findNextOpenBill(bills)?.dueDate).toEqual(new Date(2026, 1, 27));
  });

  it("pula a fatura já paga", () => {
    // A regressão: com a fatura de janeiro quitada, a próxima em aberto é a de
    // fevereiro. Mostrar janeiro como "próxima fatura" contradiz o selo "Paga"
    // que a projeção põe na mesma linha.
    const bills = [
      bill({ dueDate: new Date(2026, 0, 27), paid: true, paidAmount: 100 }),
      bill({ dueDate: new Date(2026, 1, 27), amount: 250 }),
    ];
    expect(findNextOpenBill(bills)?.dueDate).toEqual(new Date(2026, 1, 27));
  });

  it("devolve undefined quando toda fatura está paga ou zerada", () => {
    const bills = [
      bill({ paid: true, paidAmount: 100 }),
      bill({ dueDate: new Date(2026, 1, 27), amount: 0, purchaseAmount: 0 }),
    ];
    expect(findNextOpenBill(bills)).toBeUndefined();
  });

  it("devolve undefined numa série vazia", () => {
    expect(findNextOpenBill([])).toBeUndefined();
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
    expect(current(budget.fixedExpenseReminders)).toEqual([]);
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
    expect(current(budget.fixedExpenseReminders)).toEqual([]);
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

  it("conta uma vez só a despesa fixa paga no cartão", () => {
    // Pago no cartão, o valor mora na compra e o pagamento grava 0 — ver
    // markFixedExpensePaid. Com o valor nos dois, o orçamento cobraria dobrado.
    const input = {
      ...baseInput,
      fixedExpenses: [{ id: "e1", amount: 500, dueDay: 20 }],
      creditCards: [{ id: "c1", closingDay: 28, dueDay: 8 }],
      today: new Date(2026, 0, 6),
    };
    const unpaid = calculateDailyBudget(input);
    const onCard = calculateDailyBudget({
      ...input,
      cardPurchases: [{ cardId: "c1", amount: 500, date: new Date(2025, 11, 20) }],
      expensePayments: [{ fixedExpenseId: "e1", dueDate: new Date(2026, 0, 20), amount: 0 }],
    });
    expect(current(onCard.fixedExpenseReminders)).toEqual([]);
    expect(onCard.periodBalance).toBe(unpaid.periodBalance);
  });

  it("não deixa o pagamento de uma despesa fixa quitar a fatura de um cartão de mesmo id", () => {
    // fixedExpenseId e cardId vivem em espaços de id diferentes; casar só por
    // data quitaria a coisa errada.
    const budget = calculateDailyBudget({
      ...baseInput,
      fixedExpenses: [{ id: "x", amount: 500, dueDay: 20 }],
      expensePayments: [{ cardId: "x", dueDate: new Date(2026, 0, 20), amount: 500 }],
    });
    expect(current(budget.fixedExpenseReminders)).toHaveLength(1);
  });
});

describe("confirmações gravadas por servidores de fusos diferentes", () => {
  // O banco guarda o vencimento como meia-noite do fuso de quem gravou. Um
  // vencimento no dia 20 vale `2026-01-20 00:00` quando o servidor roda em UTC
  // e `2026-01-20 03:00` quando roda em Brasília. As duas formas dizem dia 20,
  // e as duas precisam quitar a mesma ocorrência — senão um lembrete já
  // confirmado reaparece assim que o fuso do servidor muda.
  const gravadoPorServidorUtc = new Date("2026-01-20T00:00:00.000Z");
  const gravadoPorServidorBrt = new Date("2026-01-20T03:00:00.000Z");

  const baseInput = {
    incomes: [{ id: "i1", amount: 3000, dayOfMonth: 5 }],
    fixedExpenses: [{ id: "e1", amount: 500, dueDay: 20 }],
    creditCards: [],
    cardPurchases: [],
    transactions: [],
    today: new Date(2026, 0, 10),
  };

  it.each([
    ["gravado por servidor em UTC", gravadoPorServidorUtc],
    ["gravado por servidor em Brasília", gravadoPorServidorBrt],
  ])("tira a despesa fixa dos lembretes: %s", (_rotulo, dueDate) => {
    const budget = calculateDailyBudget({
      ...baseInput,
      expensePayments: [{ fixedExpenseId: "e1", dueDate, amount: 500 }],
    });
    expect(current(budget.fixedExpenseReminders)).toEqual([]);
  });

  it.each([
    ["gravado por servidor em UTC", new Date("2026-01-05T00:00:00.000Z")],
    ["gravado por servidor em Brasília", new Date("2026-01-05T03:00:00.000Z")],
  ])("conta o recebimento confirmado: %s", (_rotulo, occurrenceDate) => {
    const budget = calculateDailyBudget({
      ...baseInput,
      incomeReceipts: [{ incomeId: "i1", occurrenceDate, amount: 3000 }],
    });
    expect(budget.incomeReminders).toEqual([]);
    expect(budget.incomeTotal).toBe(3000);
  });

  it.each([
    ["gravado por servidor em UTC", new Date("2026-01-08T00:00:00.000Z")],
    ["gravado por servidor em Brasília", new Date("2026-01-08T03:00:00.000Z")],
  ])("conta o lançamento no período: %s", (_rotulo, date) => {
    const budget = calculateDailyBudget({
      ...baseInput,
      fixedExpenses: [],
      transactions: [{ amount: 120, date }],
    });
    expect(budget.transactionTotal).toBe(120);
  });
});

describe("getNextPeriodBounds", () => {
  const incomes = [{ id: "i1", amount: 3000, dayOfMonth: 5 }];

  it("opens the next period exactly where the current one ends", () => {
    const current = getPeriodBounds(incomes, new Date(2026, 0, 15));
    const next = getNextPeriodBounds(incomes, current.periodEnd);

    expect(next.periodStart).toEqual(current.periodEnd);
    expect(next.periodEnd).toEqual(new Date(2026, 2, 5));
  });

  it("chains forward without drifting when a payday day doesn't exist in a month", () => {
    const incomes31 = [{ id: "i1", amount: 3000, dayOfMonth: 31 }];
    const january = getPeriodBounds(incomes31, new Date(2027, 0, 31));
    const february = getNextPeriodBounds(incomes31, january.periodEnd);
    const march = getNextPeriodBounds(incomes31, february.periodEnd);

    expect(january.periodEnd).toEqual(new Date(2027, 1, 28));
    expect(february.periodEnd).toEqual(new Date(2027, 2, 31));
    expect(march.periodEnd).toEqual(new Date(2027, 3, 30));
  });

  it("keeps the shorter periods that several incomes create", () => {
    const two = [
      { id: "salary", amount: 3000, dayOfMonth: 5 },
      { id: "freela", amount: 800, dayOfMonth: 20 },
    ];
    const current = getPeriodBounds(two, new Date(2026, 0, 10));
    const next = getNextPeriodBounds(two, current.periodEnd);

    expect(next.periodStart).toEqual(new Date(2026, 0, 20));
    expect(next.periodEnd).toEqual(new Date(2026, 1, 5));
  });
});

describe("buildCardBillSeries", () => {
  const card = { id: "c1", closingDay: 1, dueDay: 10 };
  // 20/08: a fatura que venceu dia 10 já passou, e cobra a compra de 15/07.
  const today = new Date(2026, 7, 20);
  const purchases = [
    { cardId: "c1", amount: 500, date: day(2026, 6, 15) },
    { cardId: "c1", amount: 300, date: day(2026, 7, 15) },
  ];

  it("mantém no começo da série a fatura que venceu e continua em aberto", () => {
    const bills = buildCardBillSeries({ card, purchases, today, months: 6 });

    expect(bills[0].dueDate).toEqual(new Date(2026, 7, 10));
    expect(bills[0].amount).toBe(500);
    // É ela a próxima a pagar — era isso que sumia enquanto a série começava
    // em hoje, enquanto o card de limite seguia cobrando o valor dela.
    expect(findNextOpenBill(bills)?.amount).toBe(500);
  });

  it("deixa de fora a fatura vencida que já foi marcada como paga", () => {
    const bills = buildCardBillSeries({
      card,
      purchases,
      expensePayments: [{ cardId: "c1", dueDate: new Date(2026, 7, 10), amount: 500 }],
      today,
      months: 6,
    });

    expect(bills[0].dueDate).toEqual(new Date(2026, 8, 10));
    expect(findNextOpenBill(bills)?.amount).toBe(300);
  });

  it("devolve os `months` vencimentos à frente, além das vencidas em aberto", () => {
    const bills = buildCardBillSeries({ card, purchases, today, months: 6 });

    // A vencida em aberto é um extra: ela não come uma das seis à frente.
    expect(bills).toHaveLength(7);
    expect(bills[bills.length - 1].dueDate).toEqual(new Date(2027, 1, 10));
  });

  it("não inventa fatura vencida quando não há nada em aberto para trás", () => {
    const bills = buildCardBillSeries({
      card,
      purchases: [{ cardId: "c1", amount: 300, date: day(2026, 7, 15) }],
      today,
      months: 6,
    });

    expect(bills).toHaveLength(6);
    expect(bills[0].dueDate).toEqual(new Date(2026, 8, 10));
  });
});

describe("cardBillFixedExpenses", () => {
  const card = { id: "c1", closingDay: 1, dueDay: 10 };

  it("devolve as assinaturas que a fatura de um vencimento cobra", () => {
    const expenses = cardBillFixedExpenses({
      card,
      cardFixedExpenses: [
        { id: "netflix", amount: 55, cardId: "c1" },
        { id: "spotify", amount: 22, cardId: "c1" },
        { id: "outro-cartao", amount: 99, cardId: "c2" },
      ],
      dueDate: new Date(2026, 7, 10),
    });

    expect(expenses.map((e) => e.id)).toEqual(["netflix", "spotify"]);
  });

  it("ignora a assinatura cadastrada depois de o ciclo fechar", () => {
    const expenses = cardBillFixedExpenses({
      card,
      cardFixedExpenses: [
        // O ciclo da fatura de 10/08 fecha em 01/08; cadastrada em 15/08, ela
        // só entra na fatura seguinte.
        { id: "netflix", amount: 55, cardId: "c1", createdAt: new Date(2026, 7, 15) },
      ],
      dueDate: new Date(2026, 7, 10),
    });

    expect(expenses).toEqual([]);
  });

  it("soma o mesmo que buildCardBills cobra de assinatura na fatura", () => {
    const cardFixedExpenses = [
      { id: "netflix", amount: 55, cardId: "c1" },
      { id: "spotify", amount: 22, cardId: "c1" },
    ];
    const [bill] = buildCardBills({
      card,
      purchases: [],
      cardFixedExpenses,
      from: new Date(2026, 7, 1),
      months: 1,
    });
    const expenses = cardBillFixedExpenses({ card, cardFixedExpenses, dueDate: bill.dueDate });

    expect(expenses.reduce((sum, e) => sum + e.amount, 0)).toBe(bill.fixedExpenseAmount);
  });
});

describe("fallsOnDay", () => {
  it("casa o lançamento gravado em meia-noite UTC com o dia que ele quer dizer", () => {
    expect(fallsOnDay(day(2026, 7, 20), new Date(2026, 7, 20, 15, 30))).toBe(true);
  });

  it("não puxa para hoje o lançamento do dia seguinte", () => {
    // O erro que a tela inicial tinha: lida em fuso negativo, a meia-noite UTC
    // do dia 21 vira dia 20, e "Movimentações de hoje" listava o de amanhã.
    expect(fallsOnDay(day(2026, 7, 21), new Date(2026, 7, 20, 15, 30))).toBe(false);
  });

  it("não esconde o lançamento de hoje", () => {
    expect(fallsOnDay(day(2026, 7, 20), new Date(2026, 7, 19, 15, 30))).toBe(false);
  });
});

describe("assinatura encerrada", () => {
  const card = { id: "c1", closingDay: 1, dueDay: 10 };

  it("continua na fatura cujo ciclo fechou antes de ela ser encerrada", () => {
    const expenses = cardBillFixedExpenses({
      card,
      // Encerrada em 20/08, depois de o ciclo da fatura de 10/08 fechar (01/08).
      cardFixedExpenses: [{ id: "netflix", amount: 55, cardId: "c1", endedAt: new Date(2026, 7, 20) }],
      dueDate: new Date(2026, 7, 10),
    });

    expect(expenses.map((e) => e.id)).toEqual(["netflix"]);
  });

  it("sai da fatura cujo ciclo fecha depois de ela ser encerrada", () => {
    const expenses = cardBillFixedExpenses({
      card,
      // O ciclo da fatura de 10/09 fecha em 01/09, depois do encerramento.
      cardFixedExpenses: [{ id: "netflix", amount: 55, cardId: "c1", endedAt: new Date(2026, 7, 20) }],
      dueDate: new Date(2026, 8, 10),
    });

    expect(expenses).toEqual([]);
  });

  it("cobra a fatura cujo ciclo fecha no próprio dia do encerramento", () => {
    // O ciclo que fecha em 01/08 cobre julho inteiro, mês em que a assinatura
    // esteve ativa do primeiro ao último dia. A janela é fechada nas duas
    // pontas, como já era do lado do createdAt.
    const expenses = cardBillFixedExpenses({
      card,
      cardFixedExpenses: [{ id: "netflix", amount: 55, cardId: "c1", endedAt: new Date(2026, 7, 1) }],
      dueDate: new Date(2026, 7, 10),
    });

    expect(expenses.map((e) => e.id)).toEqual(["netflix"]);
  });
});

describe("despesa fixa avulsa encerrada", () => {
  const incomes = [{ id: "i1", amount: 3000, dayOfMonth: 5 }];

  const budgetFor = (endedAt: Date | undefined) =>
    calculateDailyBudget({
      incomes,
      incomeReceipts: [{ incomeId: "i1", occurrenceDate: day(2026, 7, 5), amount: 3000 }],
      fixedExpenses: [{ id: "aluguel", amount: 1000, dueDay: 10, endedAt }],
      creditCards: [],
      cardPurchases: [],
      transactions: [],
      today: new Date(2026, 7, 20),
    });

  it("não cobra a ocorrência posterior ao encerramento", () => {
    // Período 05/08 → 05/09, vencimento em 10/08, encerrada em 01/08.
    expect(budgetFor(new Date(2026, 7, 1)).fixedExpenseTotal).toBe(0);
  });

  it("continua cobrando enquanto não é encerrada", () => {
    expect(budgetFor(undefined).fixedExpenseTotal).toBe(1000);
  });

  it("some dos lembretes depois de encerrada", () => {
    expect(current(budgetFor(new Date(2026, 7, 1)).fixedExpenseReminders)).toEqual([]);
  });
});

describe("calculateDailyBudget — contas vencidas do período anterior", () => {
  // Salário dia 5; hoje 10/set. O período anterior é 05/ago → 05/set.
  const base = {
    incomes: [{ id: "i1", amount: 3000, dayOfMonth: 5 }],
    fixedExpenses: [],
    creditCards: [{ id: "c1", closingDay: 20, dueDay: 28 }],
    cardPurchases: [{ cardId: "c1", amount: 400, date: day(2026, 7, 1) }],
    transactions: [],
    today: new Date(2026, 8, 10),
  };

  it("mantém a fatura vencida e não paga nos lembretes, marcada como vencida", () => {
    const budget = calculateDailyBudget(base);

    expect(budget.cardBillReminders).toEqual([
      { cardId: "c1", dueDate: new Date(2026, 7, 28), amount: 400, overdue: true },
    ]);
  });

  it("não soma a vencida no total do período: ela pesou no período dela", () => {
    expect(calculateDailyBudget(base).cardBillTotal).toBe(0);
  });

  it("tira dos lembretes a vencida que foi paga", () => {
    const budget = calculateDailyBudget({
      ...base,
      expensePayments: [{ cardId: "c1", dueDate: day(2026, 7, 28), amount: 400 }],
    });

    expect(budget.cardBillReminders).toEqual([]);
  });

  it("não olha mais de um período para trás", () => {
    const budget = calculateDailyBudget({ ...base, today: new Date(2026, 9, 10) });

    expect(budget.cardBillReminders).toEqual([]);
  });
});
