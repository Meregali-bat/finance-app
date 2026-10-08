import { describe, expect, it } from "vitest";
import {
  calculateDailyBudget,
  deferralTargetDate,
  expenseCharges,
  type FixedExpenseInput,
} from "./period";

/** Um dia de calendário como o banco guarda: meia-noite UTC. */
const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

// Financiamento de 1.000, dia 10, 4 parcelas a partir de 10/set.
const loan: FixedExpenseInput = {
  id: "fin",
  amount: 1000,
  dueDay: 10,
  createdAt: new Date(2026, 8, 1),
  installmentCount: 4,
};

const charges = (expense: FixedExpenseInput, from: Date, to: Date) =>
  expenseCharges(expense, from, to).map((c) => [c.dueDate.getMonth(), c.amount, c.deferredIn]);

const months = (expense: FixedExpenseInput) => {
  const all: number[][] = [];
  for (let m = 8; m < 16; m++) {
    all.push(...charges(expense, new Date(2026, m, 1), new Date(2026, m + 1, 1)));
  }
  return all;
};

describe("expenseCharges — parcelas", () => {
  it("cobra só o número de parcelas, a partir do primeiro vencimento depois do cadastro", () => {
    expect(months(loan)).toEqual([
      [8, 1000, 0],
      [9, 1000, 0],
      [10, 1000, 0],
      [11, 1000, 0],
    ]);
  });

  it("sem número de parcelas, não termina", () => {
    expect(months({ ...loan, installmentCount: undefined })).toHaveLength(8);
  });
});

describe("expenseCharges — adiamentos", () => {
  it("acumula a parcela adiada na do mês seguinte", () => {
    const expense: FixedExpenseInput = {
      ...loan,
      deferrals: [
        { dueDate: day(2026, 9, 10), targetDueDate: day(2026, 10, 10), amount: 1050, mode: "nextMonth" },
      ],
    };

    expect(months(expense)).toEqual([
      [8, 1000, 0],
      [10, 2050, 1050],
      [11, 1000, 0],
    ]);
  });

  it("joga a parcela adiada para depois da última, com o valor adiado", () => {
    const expense: FixedExpenseInput = {
      ...loan,
      deferrals: [
        { dueDate: day(2026, 9, 10), targetDueDate: day(2027, 0, 10), amount: 1100, mode: "end" },
      ],
    };

    expect(months(expense)).toEqual([
      [8, 1000, 0],
      [10, 1000, 0],
      [11, 1000, 0],
      [0, 1100, 1100],
    ]);
  });

  it("adiar de novo uma parcela que já acumulava leva tudo junto", () => {
    const expense: FixedExpenseInput = {
      ...loan,
      deferrals: [
        { dueDate: day(2026, 8, 10), targetDueDate: day(2026, 9, 10), amount: 1000, mode: "nextMonth" },
        { dueDate: day(2026, 9, 10), targetDueDate: day(2026, 10, 10), amount: 2000, mode: "nextMonth" },
      ],
    };

    expect(months(expense)).toEqual([
      [10, 3000, 2000],
      [11, 1000, 0],
    ]);
  });
});

describe("deferralTargetDate", () => {
  it("leva para o vencimento do mês seguinte", () => {
    expect(deferralTargetDate(loan, day(2026, 9, 10), "nextMonth")).toEqual(new Date(2026, 10, 10));
  });

  it("leva para depois da última parcela, enfileirando os adiamentos anteriores", () => {
    expect(deferralTargetDate(loan, day(2026, 9, 10), "end")).toEqual(new Date(2027, 0, 10));

    const queued: FixedExpenseInput = {
      ...loan,
      deferrals: [
        { dueDate: day(2026, 9, 10), targetDueDate: day(2027, 0, 10), amount: 1000, mode: "end" },
      ],
    };
    expect(deferralTargetDate(queued, day(2026, 10, 10), "end")).toEqual(new Date(2027, 1, 10));
  });

  it("recusa ir para depois da última numa despesa que não termina", () => {
    expect(() =>
      deferralTargetDate({ ...loan, installmentCount: undefined }, day(2026, 9, 10), "end"),
    ).toThrow();
  });
});

describe("adiamento no orçamento", () => {
  const base = {
    incomes: [{ id: "s", amount: 5000, dayOfMonth: 5 }],
    incomeReceipts: [{ incomeId: "s", occurrenceDate: day(2026, 9, 5), amount: 5000 }],
    creditCards: [],
    cardPurchases: [],
    transactions: [],
    today: new Date(2026, 9, 8),
  };

  it("tira a parcela adiada do período e dos lembretes", () => {
    const budget = calculateDailyBudget({
      ...base,
      fixedExpenses: [
        {
          ...loan,
          // A de setembro foi paga; a de outubro foi adiada.
          deferrals: [
            { dueDate: day(2026, 9, 10), targetDueDate: day(2026, 10, 10), amount: 1000, mode: "nextMonth" },
          ],
        },
      ],
      expensePayments: [{ fixedExpenseId: "fin", dueDate: day(2026, 8, 10), amount: 1000 }],
    });

    expect(budget.fixedExpenseTotal).toBe(0);
    expect(budget.fixedExpenseReminders).toEqual([]);
  });

  it("mostra no lembrete do mês seguinte quanto veio adiado", () => {
    const budget = calculateDailyBudget({
      ...base,
      today: new Date(2026, 10, 8),
      incomeReceipts: [{ incomeId: "s", occurrenceDate: day(2026, 10, 5), amount: 5000 }],
      fixedExpenses: [
        {
          ...loan,
          deferrals: [
            { dueDate: day(2026, 9, 10), targetDueDate: day(2026, 10, 10), amount: 1050, mode: "nextMonth" },
          ],
        },
      ],
      expensePayments: [{ fixedExpenseId: "fin", dueDate: day(2026, 8, 10), amount: 1000 }],
    });

    expect(budget.fixedExpenseTotal).toBe(2050);
    expect(budget.fixedExpenseReminders).toEqual([
      { expenseId: "fin", dueDate: new Date(2026, 10, 10), amount: 2050, deferredIn: 1050 },
    ]);
  });
});
