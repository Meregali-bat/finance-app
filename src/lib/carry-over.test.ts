import { describe, expect, it } from "vitest";
import {
  MAX_CARRY_PERIODS,
  calculateCurrentBudget,
  historyOpeningBalance,
  previousPeriods,
} from "./carry-over";
import type { BudgetInput } from "./period";

/** Um dia de calendário como o banco guarda: meia-noite UTC. Ver period.test.ts. */
const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

/**
 * Salário de 5.000 todo dia 5, cadastrado em 01/jul. Hoje é 10/set, então o
 * período corrente é 05/set → 05/out e os anteriores são 05/ago → 05/set,
 * 05/jul → 05/ago e o pedaço 01/jul → 05/jul, antes do primeiro pagamento.
 */
const today = new Date(2026, 8, 10);

const base: BudgetInput = {
  incomes: [{ id: "salario", amount: 5000, dayOfMonth: 5, createdAt: new Date(2026, 6, 1) }],
  incomeReceipts: [
    { incomeId: "salario", occurrenceDate: day(2026, 6, 5), amount: 5000 },
    { incomeId: "salario", occurrenceDate: day(2026, 7, 5), amount: 5000 },
    { incomeId: "salario", occurrenceDate: day(2026, 8, 5), amount: 5000 },
  ],
  fixedExpenses: [],
  creditCards: [],
  cardPurchases: [],
  transactions: [],
  today,
};

function input(overrides: Partial<BudgetInput> = {}): BudgetInput {
  return { ...base, ...overrides };
}

describe("previousPeriods", () => {
  it("anda para trás até o cadastro da renda, do mais antigo ao mais recente", () => {
    const periods = previousPeriods(input(), new Date(2026, 8, 5));

    expect(periods).toEqual([
      // O pedaço antes do primeiro pagamento é esticado até o cadastro.
      { periodStart: new Date(2026, 6, 1), periodEnd: new Date(2026, 6, 5) },
      { periodStart: new Date(2026, 6, 5), periodEnd: new Date(2026, 7, 5) },
      { periodStart: new Date(2026, 7, 5), periodEnd: new Date(2026, 8, 5) },
    ]);
  });

  it("não olha além de MAX_CARRY_PERIODS", () => {
    const periods = previousPeriods(
      input({ incomes: [{ id: "salario", amount: 5000, dayOfMonth: 5 }] }),
      new Date(2026, 8, 5),
    );

    expect(periods).toHaveLength(MAX_CARRY_PERIODS);
    expect(periods.at(-1)?.periodEnd).toEqual(new Date(2026, 8, 5));
  });

  it("não inventa período antes do primeiro dia acompanhado", () => {
    // Cadastrada no próprio dia de pagamento: não há pedaço antes dele.
    const periods = previousPeriods(
      input({
        incomes: [
          { id: "salario", amount: 5000, dayOfMonth: 5, createdAt: new Date(2026, 7, 5) },
        ],
        // Sem o recebimento de 05/jul: confirmá-lo provaria que aquele período
        // existiu, e a caminhada iria até ele.
        incomeReceipts: base.incomeReceipts!.slice(1),
      }),
      new Date(2026, 8, 5),
    );

    expect(periods).toEqual([
      { periodStart: new Date(2026, 7, 5), periodEnd: new Date(2026, 8, 5) },
    ]);
  });
});

describe("historyOpeningBalance — sem saldo em conta", () => {
  it("passa a sobra de cada período para o seguinte", () => {
    // Jul: 5.000 − 2.000 = 3.000. Ago: 5.000 − 2.000 = 3.000. Somam 6.000.
    const opening = historyOpeningBalance(
      input({
        fixedExpenses: [
          { id: "aluguel", amount: 2000, dueDay: 10, createdAt: new Date(2026, 6, 1) },
        ],
      }),
      new Date(2026, 8, 5),
    );

    expect(opening).toBe(6000);
  });

  it("passa adiante também o que faltou", () => {
    // Agosto gastou 8.000 com renda de 5.000: os −3.000 comem a sobra de julho.
    const opening = historyOpeningBalance(
      input({ transactions: [{ amount: 8000, date: day(2026, 7, 20) }] }),
      new Date(2026, 8, 5),
    );

    expect(opening).toBe(5000 + 5000 - 8000);
  });

  it("não dá de graça um período negativo", () => {
    const opening = historyOpeningBalance(
      input({
        incomeReceipts: [{ incomeId: "salario", occurrenceDate: day(2026, 7, 5), amount: 5000 }],
        transactions: [{ amount: 6000, date: day(2026, 7, 20) }],
      }),
      new Date(2026, 8, 5),
    );

    expect(opening).toBe(-1000);
  });

  it("conta o gasto de antes do primeiro pagamento", () => {
    const opening = historyOpeningBalance(
      input({ transactions: [{ amount: 100, date: day(2026, 6, 2) }] }),
      new Date(2026, 8, 5),
    );

    expect(opening).toBe(10000 - 100);
  });

  it("ignora as linhas do fechamento antigo, que levariam a sobra duas vezes", () => {
    const opening = historyOpeningBalance(
      input({
        transactions: [{ amount: -5000, date: day(2026, 7, 6), fromPeriodClose: true }],
      }),
      new Date(2026, 8, 5),
    );

    expect(opening).toBe(10000);
  });

  it("tira da corrente o que foi guardado em caixinha", () => {
    const opening = historyOpeningBalance(
      input({ jarDeposits: [{ amount: 4000, date: new Date(2026, 7, 6, 15, 30) }] }),
      new Date(2026, 8, 5),
    );

    expect(opening).toBe(6000);
  });

  it("não conta salário que ninguém confirmou", () => {
    const opening = historyOpeningBalance(
      input({
        incomeReceipts: [{ incomeId: "salario", occurrenceDate: day(2026, 7, 5), amount: 5000 }],
      }),
      new Date(2026, 8, 5),
    );

    expect(opening).toBe(5000);
  });
});

describe("calculateCurrentBudget", () => {
  it("sem saldo em conta, soma a herança ao resultado do período", () => {
    const budget = calculateCurrentBudget(
      input({
        fixedExpenses: [
          { id: "aluguel", amount: 2000, dueDay: 10, createdAt: new Date(2026, 6, 1) },
        ],
      }),
    );

    expect(budget.openingSource).toBe("history");
    expect(budget.openingBalance).toBe(6000);
    expect(budget.periodResult).toBe(3000);
    expect(budget.periodBalance).toBe(9000);
    // 25 dias de 10/set a 05/out.
    expect(budget.dailyAvailable).toBeCloseTo(9000 / 25, 10);
  });

  it("com saldo em conta, parte do dinheiro real e desconta só o que ainda vai sair", () => {
    // O banco tem 1.200. O aluguel de 10/set ainda não foi pago; a conta de
    // luz de 07/set já foi, e por isso já está dentro dos 1.200.
    const budget = calculateCurrentBudget({
      ...input({
        fixedExpenses: [
          { id: "aluguel", amount: 2000, dueDay: 10, createdAt: new Date(2026, 8, 1) },
          { id: "luz", amount: 300, dueDay: 7, createdAt: new Date(2026, 8, 1) },
        ],
        expensePayments: [{ fixedExpenseId: "luz", dueDate: day(2026, 8, 7), amount: 300 }],
      }),
      accountBalance: 1200,
    });

    expect(budget.openingSource).toBe("account");
    expect(budget.periodBalance).toBe(1200 - 2000);
    // O que havia antes do período: 1.200 hoje, menos o salário que entrou,
    // mais a luz que saiu.
    expect(budget.periodResult).toBe(5000 - 2000 - 300);
    expect(budget.openingBalance).toBe(1200 - 2000 - 2700);
  });

  it("com saldo em conta, desconta a conta do período anterior que segue sem pagamento", () => {
    // O aluguel de 10/ago não foi pago: não saiu da conta, e ainda vai sair.
    const budget = calculateCurrentBudget({
      ...input({
        fixedExpenses: [
          { id: "aluguel", amount: 2000, dueDay: 10, createdAt: new Date(2026, 6, 1) },
        ],
        expensePayments: [{ fixedExpenseId: "aluguel", dueDate: day(2026, 8, 10), amount: 2000 }],
      }),
      accountBalance: 5000,
    });

    expect(budget.periodBalance).toBe(3000);
    expect(budget.fixedExpenseReminders).toEqual([
      { expenseId: "aluguel", dueDate: new Date(2026, 7, 10), amount: 2000, overdue: true },
    ]);
  });

  it("com saldo em conta, desconta o lançamento com data futura mas não o de hoje", () => {
    const budget = calculateCurrentBudget({
      ...input({
        transactions: [
          { amount: 50, date: day(2026, 8, 10) },
          { amount: 400, date: day(2026, 8, 20) },
          { amount: -1000, date: day(2026, 8, 25) },
        ],
      }),
      accountBalance: 3000,
    });

    expect(budget.periodBalance).toBe(3000 - 400 + 1000);
  });

  it("com saldo em conta, ignora a corrente dos períodos anteriores", () => {
    const budget = calculateCurrentBudget({
      ...input({ transactions: [{ amount: 90000, date: day(2026, 7, 20) }] }),
      accountBalance: 3000,
    });

    expect(budget.periodBalance).toBe(3000);
  });

  it("uma renda desligada não marca período, mas o que ela pagou continua contando", () => {
    const budget = calculateCurrentBudget(
      input({
        incomes: [
          ...base.incomes,
          { id: "freela", amount: 800, dayOfMonth: 20, active: false },
        ],
        incomeReceipts: [
          ...base.incomeReceipts!,
          { incomeId: "freela", occurrenceDate: day(2026, 8, 8), amount: 800 },
        ],
      }),
    );

    // O freela no dia 20 cortaria o período em 20/set; desligado, não corta.
    expect(budget.periodEnd).toEqual(new Date(2026, 9, 5));
    expect(budget.incomeTotal).toBe(5800);
    expect(budget.incomeReminders.map((r) => r.incomeId)).toEqual([]);
  });
});
