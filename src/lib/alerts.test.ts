import { describe, expect, it } from "vitest";
import type { BudgetInputs } from "@/lib/budget-inputs";
import { dailyAlerts, overspendAlert, todaysSpending, withoutTodaysSpending } from "./alerts";

// Datas de calendário gravadas como meia-noite UTC, como no banco.
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
// Tudo cadastrado no começo de outubro: sem meses anteriores no vermelho.
const OLD = new Date(2026, 9, 1);

function inputs(overrides: Partial<BudgetInputs> = {}): BudgetInputs {
  return {
    incomes: [{ id: "sal", label: "Salário", amount: 3000, dayOfMonth: 5, createdAt: OLD }],
    incomeReceipts: [{ incomeId: "sal", occurrenceDate: day("2026-10-05"), amount: 3000 }],
    fixedExpenses: [
      { id: "alu", label: "Aluguel", amount: 1200, dueDay: 21, createdAt: OLD },
      { id: "net", label: "Internet", amount: 100, dueDay: 25, createdAt: OLD },
    ],
    creditCards: [
      { id: "nu", name: "Nubank", closingDay: 20, dueDay: 28, active: true },
      { id: "old", name: "Antigo", closingDay: 20, dueDay: 28, active: false },
    ],
    cardPurchases: [{ cardId: "nu", amount: 300, date: day("2026-10-02") }],
    billEstimates: [],
    expensePayments: [],
    transactions: [],
    jarDeposits: [],
    account: { credits: [], debits: [] },
    ...overrides,
  };
}

describe("dailyAlerts", () => {
  it("avisa a conta de amanhã e o fechamento de hoje, e nada mais", () => {
    const alerts = dailyAlerts(inputs(), new Date(2026, 9, 20, 8));
    expect(alerts.map((a) => a.title)).toEqual([
      "Aluguel vence amanhã",
      "Fatura do Nubank fecha hoje",
    ]);
    expect(alerts[0].body).toMatch(/^R\$\s1\.200,00\./);
  });

  it("não avisa conta já paga", () => {
    const alerts = dailyAlerts(
      inputs({
        expensePayments: [{ fixedExpenseId: "alu", dueDate: day("2026-10-21"), amount: 1200 }],
      }),
      new Date(2026, 9, 20, 8),
    );
    expect(alerts.map((a) => a.title)).not.toContain("Aluguel vence amanhã");
  });

  it("avisa a fatura que vence hoje, se não foi paga", () => {
    const today = new Date(2026, 9, 28, 8);
    expect(dailyAlerts(inputs(), today).map((a) => a.title)).toContain(
      "Fatura do Nubank vence hoje",
    );
    const paid = inputs({
      expensePayments: [{ cardId: "nu", dueDate: day("2026-10-28"), amount: 300 }],
    });
    expect(dailyAlerts(paid, today).map((a) => a.title)).not.toContain(
      "Fatura do Nubank vence hoje",
    );
  });

  it("pergunta da renda no dia do pagamento, até ser confirmada", () => {
    const today = new Date(2026, 10, 5, 8);
    expect(dailyAlerts(inputs(), today).map((a) => a.title)).toContain("Hoje é dia de Salário");
    const confirmed = inputs({
      incomeReceipts: [
        { incomeId: "sal", occurrenceDate: day("2026-10-05"), amount: 3000 },
        { incomeId: "sal", occurrenceDate: day("2026-11-05"), amount: 3000 },
      ],
    });
    expect(dailyAlerts(confirmed, today).map((a) => a.title)).not.toContain(
      "Hoje é dia de Salário",
    );
  });

  it("dia sem nada, sem aviso", () => {
    expect(dailyAlerts(inputs(), new Date(2026, 9, 10, 8))).toEqual([]);
  });

  it("fechamento no dia 31 cai no último dia de um mês curto", () => {
    const card = { id: "c", name: "Sicoob", closingDay: 31, dueDay: 10, active: true };
    const alerts = dailyAlerts(inputs({ creditCards: [card] }), new Date(2026, 10, 30, 8));
    expect(alerts.map((a) => a.title)).toContain("Fatura do Sicoob fecha hoje");
  });
});

describe("gasto de hoje", () => {
  const today = new Date(2026, 9, 20, 15);
  const spending = inputs({
    transactions: [
      {
        id: "t1",
        description: "Mercado",
        amount: 80,
        date: day("2026-10-20"),
        categoryId: null,
        createdAt: today,
      },
      {
        id: "t2",
        description: "Ontem",
        amount: 50,
        date: day("2026-10-19"),
        categoryId: null,
        createdAt: today,
      },
      {
        id: "t3",
        description: "Reembolso",
        amount: -40,
        date: day("2026-10-20"),
        categoryId: null,
        createdAt: today,
      },
    ],
    cardPurchases: [
      { cardId: "nu", amount: 300, date: day("2026-10-02") },
      { cardId: "nu", amount: 25, date: day("2026-10-20") },
    ],
    account: {
      credits: [],
      debits: [
        { amount: 80, registeredAt: today, occurredOn: new Date(2026, 9, 20) },
        { amount: 50, registeredAt: today, occurredOn: new Date(2026, 9, 19) },
        { amount: 300, registeredAt: today, occurredOn: new Date(2026, 9, 20) },
      ],
    },
  });

  it("soma só os gastos de hoje, no dinheiro e no cartão", () => {
    expect(todaysSpending(spending, today)).toBe(105);
  });

  it("tira os gastos de hoje e o débito correspondente, deixando o resto", () => {
    const start = withoutTodaysSpending(spending, today);
    expect(start.transactions.map((t) => t.id)).toEqual(["t2", "t3"]);
    expect(start.cardPurchases).toHaveLength(1);
    expect(start.account.debits.map((d) => d.amount)).toEqual([50, 300]);
  });
});

describe("overspendAlert", () => {
  const today = new Date(2026, 9, 20, 15);
  const spend = (amount: number) =>
    inputs({
      transactions: [
        {
          id: "t",
          description: "Loja",
          amount,
          date: day("2026-10-20"),
          categoryId: null,
          createdAt: today,
        },
      ],
    });

  it("dentro do limite, nada", () => {
    expect(overspendAlert(spend(10), today)).toBeNull();
  });

  it("passou do limite: diz quanto e como fica", () => {
    const alert = overspendAlert(spend(1000), today);
    expect(alert?.title).toMatch(/^Você passou R\$\s912,50 do limite de hoje$/);
    expect(alert?.body).toMatch(/já foram R\$\s1\.000,00/);
  });

  it("sem gasto hoje, nada", () => {
    expect(overspendAlert(inputs(), today)).toBeNull();
  });
});
