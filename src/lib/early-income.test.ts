import { describe, expect, it } from "vitest";
import type { BudgetInputs } from "@/lib/budget-inputs";
import { calculateDailyBudget, getPeriodBounds, type IncomeReceiptInput } from "./period";
import { forecastPeriods } from "./forecast";
import { todayBudget } from "./today-budget";

/** Um dia de calendário como o banco guarda: meia-noite UTC. */
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const CREATED = new Date(2026, 8, 1);
/** As contas entraram no app depois da luz de outubro. */
const BILLS_FROM = new Date(2026, 9, 4);

/**
 * Salário de 5.000 no dia 5, aluguel de 1.000 no dia 10 e luz de 200 no dia 2.
 * O de outubro caiu no dia certo. O de novembro caiu adiantado, em 03/11.
 */
const salary = { id: "sal", label: "Salário", amount: 5000, dayOfMonth: 5, createdAt: CREATED };
const october: IncomeReceiptInput = { incomeId: "sal", occurrenceDate: day("2026-10-05"), amount: 5000 };
const earlyNovember: IncomeReceiptInput = {
  incomeId: "sal",
  occurrenceDate: day("2026-11-03"),
  forPayday: day("2026-11-05"),
  amount: 5000,
};

function inputs(overrides: Partial<BudgetInputs> = {}): BudgetInputs {
  return {
    incomes: [salary],
    incomeReceipts: [october],
    fixedExpenses: [
      { id: "aluguel", label: "Aluguel", amount: 1000, dueDay: 10, createdAt: BILLS_FROM },
      { id: "luz", label: "Luz", amount: 200, dueDay: 2, createdAt: BILLS_FROM },
    ],
    creditCards: [],
    cardPurchases: [],
    billEstimates: [],
    expensePayments: [
      { fixedExpenseId: "aluguel", dueDate: day("2026-10-10"), amount: 1000 },
      { fixedExpenseId: "luz", dueDate: day("2026-11-02"), amount: 200 },
    ],
    transactions: [],
    jarDeposits: [],
    slices: null,
    account: { credits: [], debits: [] },
    ...overrides,
  };
}

describe("salário que cai antes do dia cadastrado", () => {
  const today = new Date(2026, 10, 3, 9);

  it("o lembrete do próximo salário aparece nos dias antes dele", () => {
    const budget = calculateDailyBudget({ ...inputs(), today });
    expect(budget.incomeReminders).toEqual([
      { incomeId: "sal", dueDate: new Date(2026, 10, 5), amount: 5000, early: true },
    ]);
    // Ainda é o ciclo de outubro: o aluguel de novembro não está nele.
    expect(budget.fixedExpenseReminders).toEqual([]);
  });

  it("longe do dia, não aparece", () => {
    const budget = calculateDailyBudget({ ...inputs(), today: new Date(2026, 9, 20) });
    expect(budget.incomeReminders).toEqual([]);
  });

  it("confirmado, abre o ciclo novo no dia em que caiu, com as contas dele", () => {
    const budget = calculateDailyBudget({
      ...inputs({ incomeReceipts: [october, earlyNovember] }),
      today,
    });
    expect(budget.periodStart).toEqual(new Date(2026, 10, 3));
    expect(budget.periodEnd).toEqual(new Date(2026, 11, 5));
    expect(budget.incomeReminders).toEqual([]);
    expect(budget.incomeTotal).toBe(5000);
    expect(budget.fixedExpenseReminders.map((r) => [r.expenseId, r.dueDate])).toEqual([
      ["aluguel", new Date(2026, 10, 10)],
      ["luz", new Date(2026, 11, 2)],
    ]);
  });

  it("o ciclo de outubro fecha no dia em que o salário caiu", () => {
    const receipts = [october, earlyNovember];
    expect(getPeriodBounds([salary], new Date(2026, 10, 2), receipts)).toEqual({
      periodStart: new Date(2026, 9, 5),
      periodEnd: new Date(2026, 10, 3),
    });
  });

  it("a Previsão conta o salário de novembro uma vez só", () => {
    const [current, next] = forecastPeriods({
      ...inputs({ incomeReceipts: [october, earlyNovember] }),
      today,
      count: 1,
    });
    expect(current.incomeTotal).toBe(5000);
    expect(next.periodStart).toEqual(new Date(2026, 11, 5));
    expect(next.incomeTotal).toBe(5000);
    expect(next.entries.filter((e) => e.kind === "income")).toHaveLength(1);
  });

  it("com saldo em conta, pagar o aluguel agora não desconta duas vezes", () => {
    // Saldo informado hoje cedo, já com o salário: R$ 6.000.
    const reading = new Date(2026, 10, 3, 8);
    const base = inputs({
      incomeReceipts: [october, earlyNovember],
      account: {
        adjustment: { balance: 6000, createdAt: reading },
        credits: [{ amount: 5000, registeredAt: reading, occurredOn: new Date(2026, 10, 3) }],
        debits: [],
      },
    });
    const before = todayBudget(base, today);
    // Paga o aluguel de 10/11 hoje pelo "Pagar" comum.
    const paidAt = new Date(2026, 10, 3, 10);
    const after = todayBudget(
      {
        ...base,
        expensePayments: [
          ...base.expensePayments!,
          { fixedExpenseId: "aluguel", dueDate: day("2026-11-10"), amount: 1000 },
        ],
        account: {
          ...base.account,
          debits: [{ amount: 1000, registeredAt: paidAt, occurredOn: paidAt }],
        },
      },
      today,
    );
    expect(after.budget.periodBalance).toBeCloseTo(before.budget.periodBalance);
    expect(after.dailyAvailable).toBeCloseTo(before.dailyAvailable);
  });
});

describe("salário do dia 1º que cai no fim do mês anterior", () => {
  const dayOne = { ...salary, dayOfMonth: 1 };
  const receipts: IncomeReceiptInput[] = [
    { incomeId: "sal", occurrenceDate: day("2026-10-01"), amount: 5000 },
    { incomeId: "sal", occurrenceDate: day("2026-10-30"), forPayday: day("2026-11-01"), amount: 5000 },
  ];

  it("é o de novembro: outubro continua começando no dia 1º", () => {
    expect(getPeriodBounds([dayOne], new Date(2026, 9, 20), receipts)).toEqual({
      periodStart: new Date(2026, 9, 1),
      periodEnd: new Date(2026, 9, 30),
    });
    expect(getPeriodBounds([dayOne], new Date(2026, 9, 31), receipts)).toEqual({
      periodStart: new Date(2026, 9, 30),
      periodEnd: new Date(2026, 11, 1),
    });
  });

  it("novembro não pede o salário de novo", () => {
    const budget = calculateDailyBudget({
      ...inputs({ incomes: [dayOne], incomeReceipts: receipts, fixedExpenses: [], expensePayments: [] }),
      today: new Date(2026, 10, 2),
    });
    expect(budget.incomeReminders).toEqual([]);
    expect(budget.periodStart).toEqual(new Date(2026, 9, 30));
  });
});
