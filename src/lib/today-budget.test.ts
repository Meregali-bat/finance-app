import { describe, expect, it } from "vitest";
import type { BudgetInputs } from "@/lib/budget-inputs";
import { DEFAULT_SLICES } from "@/lib/slices";
import { todayBudget } from "./today-budget";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const CREATED = new Date(2026, 9, 1);

// Renda de 3.000 recebida no dia 5, nada mais: o período vai de 05/10 a
// 05/11, e no dia 20 restam 16 dias com R$ 3.000 livres.
function inputs(overrides: Partial<BudgetInputs> = {}): BudgetInputs {
  return {
    incomes: [{ id: "sal", label: "Salário", amount: 3000, dayOfMonth: 5, createdAt: CREATED }],
    incomeReceipts: [{ incomeId: "sal", occurrenceDate: day("2026-10-05"), amount: 3000 }],
    fixedExpenses: [],
    creditCards: [],
    cardPurchases: [],
    billEstimates: [],
    expensePayments: [],
    transactions: [],
    jarDeposits: [],
    slices: null,
    account: { credits: [], debits: [] },
    ...overrides,
  };
}
const today = new Date(2026, 9, 20, 12);

describe("todayBudget com as fatias da renda", () => {
  it("sem fatias, nada muda", () => {
    const result = todayBudget(inputs(), today);
    expect(result.savings).toBeNull();
    expect(result.dailyAvailable).toBeCloseTo(3000 / 16);
  });

  it("reserva os 40% de guardar (R$ 1.200) e divide o resto", () => {
    const result = todayBudget(inputs({ slices: DEFAULT_SLICES }), today);
    expect(result.savings).toMatchObject({ target: 1200, saved: 0, applied: 1200, shortfall: 0 });
    expect(result.dailyAvailable).toBeCloseTo(1800 / 16);
  });

  it("o que já foi para a caixinha não é descontado duas vezes", () => {
    const result = todayBudget(
      inputs({
        slices: DEFAULT_SLICES,
        jarDeposits: [{ amount: 500, date: new Date(2026, 9, 10) }],
      }),
      today,
    );
    expect(result.savings).toMatchObject({ saved: 500, remaining: 700, applied: 700 });
    // 3.000 − 500 guardados − 700 que faltam guardar.
    expect(result.dailyAvailable).toBeCloseTo(1800 / 16);
  });

  it("quando a reserva leva tudo, o dia fica em zero redondo, não em -0,00", () => {
    // Sobram R$ 100,87 e faltam R$ 1.200 a guardar: a reserva come tudo. A
    // conta em ponto flutuante dava -0,0000000001, e a Início dizia "Você já
    // estourou o orçamento de hoje: -R$ 0,00".
    const result = todayBudget(
      inputs({
        slices: DEFAULT_SLICES,
        transactions: [
          {
            id: "gasto",
            description: "Gastos",
            amount: 2899.13,
            date: day("2026-10-06"),
            categoryId: null,
            createdAt: null,
          },
        ],
      }),
      today,
    );
    expect(result.savings).toMatchObject({ applied: 100.87, shortfall: 1099.13 });
    expect(Object.is(result.dailyAvailable, 0)).toBe(true);
  });
});
