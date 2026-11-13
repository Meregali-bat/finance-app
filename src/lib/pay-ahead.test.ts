import { describe, expect, it } from "vitest";
import type { BudgetInputs } from "@/lib/budget-inputs";
import { nextUnpaidChargeFrom, ownSpendingOf, storedDay, type FixedExpenseInput } from "./period";
import { todayBudget } from "./today-budget";

/** Um dia de calendário como o banco guarda: meia-noite UTC. */
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const CREATED = new Date(2026, 9, 1);

const rent: FixedExpenseInput = { id: "aluguel", amount: 1000, dueDay: 10, createdAt: CREATED };

describe("nextUnpaidChargeFrom", () => {
  // O ciclo de agora vai de 05/10 a 05/11: a próxima cobrança depois dele é 10/11.
  const periodEnd = new Date(2026, 10, 5);

  it("é a primeira cobrança em ou depois do fim do ciclo", () => {
    expect(nextUnpaidChargeFrom(rent, periodEnd)).toEqual({
      dueDate: new Date(2026, 10, 10),
      amount: 1000,
    });
  });

  it("pula a que já foi paga adiantada", () => {
    expect(nextUnpaidChargeFrom(rent, periodEnd, [day("2026-11-10")])?.dueDate).toEqual(
      new Date(2026, 11, 10),
    );
  });

  it("leva junto o que foi adiado para ela", () => {
    const withDeferral: FixedExpenseInput = {
      ...rent,
      deferrals: [
        {
          dueDate: day("2026-10-10"),
          targetDueDate: day("2026-11-10"),
          amount: 1050,
          mode: "nextMonth",
        },
      ],
    };
    expect(nextUnpaidChargeFrom(withDeferral, periodEnd)?.amount).toBe(2050);
  });

  it("pausada, no cartão ou sem dia de vencimento, não tem o que adiantar", () => {
    expect(nextUnpaidChargeFrom({ ...rent, pauses: [{ start: new Date(2026, 9, 15) }] }, periodEnd)).toBeNull();
    expect(nextUnpaidChargeFrom({ ...rent, cardId: "nubank" }, periodEnd)).toBeNull();
    expect(nextUnpaidChargeFrom({ ...rent, dueDay: undefined }, periodEnd)).toBeNull();
  });

  it("com as parcelas acabadas, nada", () => {
    expect(nextUnpaidChargeFrom({ ...rent, installmentCount: 1 }, periodEnd)).toBeNull();
  });
});

/**
 * Salário de 3.000 no dia 5 e aluguel de 1.000 no dia 10, o de outubro já pago.
 * O saldo foi informado hoje (20/10) de manhã: R$ 5.000. O ciclo vai de 05/10
 * a 05/11, e o aluguel de 10/11 é do ciclo seguinte.
 */
const today = new Date(2026, 9, 20, 15);
const reading = new Date(2026, 9, 20, 8);

function inputs(overrides: Partial<BudgetInputs> = {}): BudgetInputs {
  return {
    incomes: [{ id: "sal", label: "Salário", amount: 3000, dayOfMonth: 5, createdAt: CREATED }],
    incomeReceipts: [{ incomeId: "sal", occurrenceDate: day("2026-10-05"), amount: 3000 }],
    fixedExpenses: [{ ...rent, label: "Aluguel" }],
    creditCards: [],
    cardPurchases: [],
    billEstimates: [],
    expensePayments: [{ fixedExpenseId: "aluguel", dueDate: day("2026-10-10"), amount: 1000 }],
    transactions: [],
    jarDeposits: [],
    slices: null,
    account: { adjustment: { balance: 5000, createdAt: reading }, credits: [], debits: [] },
    ...overrides,
  };
}

/** O aluguel de 10/11 pago hoje como o "Pagar adiantado" grava. */
function paidAhead(base: BudgetInputs): BudgetInputs {
  const paidAt = new Date(2026, 9, 20, 10);
  return {
    ...base,
    transactions: [
      {
        id: "adiantado",
        description: "Aluguel: vencimento de 10/11 pago adiantado",
        categoryId: null,
        createdAt: paidAt,
        amount: 1000,
        date: day("2026-10-20"),
        advance: true,
      },
    ],
    expensePayments: [
      ...base.expensePayments,
      { fixedExpenseId: "aluguel", dueDate: day("2026-11-10"), amount: 0 },
    ],
    account: {
      ...base.account,
      // Como loadBudgetInputs monta o débito de um lançamento.
      debits: [{ amount: 1000, registeredAt: paidAt, occurredOn: storedDay(day("2026-10-20")) }],
    },
  };
}

describe("pagar adiantado a conta do próximo ciclo", () => {
  const before = todayBudget(inputs(), today);
  const after = todayBudget(paidAhead(inputs()), today);

  it("o dinheiro sai do ciclo de agora", () => {
    expect(after.accountBalance).toBe(4000);
    // 16 dias até 05/11.
    expect(after.dailyAvailable).toBeCloseTo(before.dailyAvailable - 1000 / 16);
  });

  it("e o ciclo seguinte não cobra o aluguel de novo", () => {
    const [, nextBefore] = before.periods;
    const [, nextAfter] = after.periods;
    expect(nextBefore!.fixedExpenseTotal).toBe(1000);
    expect(nextAfter!.fixedExpenseTotal).toBe(0);
    // O mesmo dinheiro no fim: saiu antes, mas saiu uma vez só.
    expect(nextAfter!.balance).toBeCloseTo(nextBefore!.balance);
  });

  it("um pagamento comum de valor cheio contaria o aluguel duas vezes", () => {
    // O motivo de o adiantamento virar lançamento + pagamento de 0.
    const naive = paidAhead(inputs());
    naive.transactions = [];
    naive.expensePayments = [
      ...inputs().expensePayments,
      { fixedExpenseId: "aluguel", dueDate: day("2026-11-10"), amount: 1000 },
    ];
    const [, nextNaive] = todayBudget(naive, today).periods;
    expect(nextNaive!.balance).toBeCloseTo(before.periods[1]!.balance - 1000);
  });
});

describe("o lançamento do adiantamento nos ritmos de gasto", () => {
  it("é conta fixa, não gasto do dia a dia", () => {
    expect(ownSpendingOf({ amount: 1000, advance: true })).toBe(0);
    expect(ownSpendingOf({ amount: 1000 })).toBe(1000);
  });
});
