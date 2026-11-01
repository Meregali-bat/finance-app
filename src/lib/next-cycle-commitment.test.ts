import { describe, expect, it } from "vitest";
import { nextCycleCommitment } from "./next-cycle-commitment";

const next = (cardBillTotal: number, fixedExpenseTotal = 1000, expectedIncomeTotal = 5000) => ({
  periodStart: new Date(2026, 10, 15),
  expectedIncomeTotal,
  cardBillTotal,
  fixedExpenseTotal,
});

describe("nextCycleCommitment", () => {
  it("abaixo de 30% da renda em fatura, não aparece", () => {
    expect(nextCycleCommitment(next(1499), 70)).toBeNull();
  });

  it("de 30% a 50% é atenção; acima, ou passando do teto, alerta", () => {
    expect(nextCycleCommitment(next(1500), 70)).toMatchObject({
      tone: "attention",
      cardShare: 0.3,
      totalShare: 0.5,
      overLimit: false,
    });
    expect(nextCycleCommitment(next(2700, 1900), 70)).toMatchObject({
      tone: "alert",
      cardShare: 0.54,
      totalShare: 0.92,
      overLimit: true,
    });
    expect(nextCycleCommitment(next(1600, 2500), 70)).toMatchObject({
      tone: "alert",
      cardShare: 0.32,
      overLimit: true,
    });
  });

  it("sem renda no próximo ciclo, não aparece", () => {
    expect(nextCycleCommitment(next(3000, 0, 0), 70)).toBeNull();
    expect(nextCycleCommitment(undefined, 70)).toBeNull();
  });
});
