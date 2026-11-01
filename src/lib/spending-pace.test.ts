import { describe, expect, it } from "vitest";
import { paceAcrossCycles, paceSpendByCycle, spendingPace } from "./spending-pace";

const utc = (m: number, d: number) => new Date(Date.UTC(2026, m - 1, d));
// Ciclo de 15/out a 15/nov; hoje é 24/out, o 10º dia. Faltam 22 dias com hoje.
const base = {
  periodStart: new Date(2026, 9, 15),
  daysLeft: 22,
  today: new Date(2026, 9, 24, 20),
  transactions: [],
  cardPurchases: [],
};

describe("spendingPace", () => {
  it("a média do ciclo, separada em conta e em cada cartão", () => {
    const pace = spendingPace({
      ...base,
      transactions: [
        { amount: 300, date: utc(10, 16) },
        { amount: 100, date: utc(10, 24) },
      ],
      cardPurchases: [{ cardId: "nu", amount: 100, date: utc(10, 20) }],
    })!;
    expect(pace).toMatchObject({
      spent: 500,
      elapsedDays: 10,
      perDay: 50,
      accountPerDay: 40,
      cardPerDay: [{ cardId: "nu", perDay: 10 }],
      remainingDays: 21,
    });
  });

  it("compra parcelada entra pela parcela; receita, fechamento e fora do ciclo não", () => {
    const pace = spendingPace({
      ...base,
      transactions: [
        { amount: -5000, date: utc(10, 15) },
        { amount: 80, date: utc(10, 15), fromPeriodClose: true },
        { amount: 70, date: utc(10, 14) },
        { amount: 90, date: utc(10, 25) },
        { amount: 100, date: utc(10, 18) },
      ],
      cardPurchases: [{ cardId: "nu", amount: 1200, date: utc(10, 20), installments: 12 }],
    })!;
    expect(pace.spent).toBe(200);
  });

  it("nos primeiros dias, ou sem gasto, não projeta", () => {
    expect(
      spendingPace({
        ...base,
        today: new Date(2026, 9, 16),
        transactions: [{ amount: 50, date: utc(10, 15) }],
      }),
    ).toBeNull();
    expect(spendingPace(base)).toBeNull();
  });
});

describe("paceSpendByCycle", () => {
  // Ciclos de salário dia 15: 15/out–15/nov e 15/nov–15/dez.
  const periods = [
    { periodStart: new Date(2026, 9, 15), periodEnd: new Date(2026, 10, 15) },
    { periodStart: new Date(2026, 10, 15), periodEnd: new Date(2026, 11, 15) },
  ];
  // Fecha dia 1, vence dia 10: o que se compra de 2/out a 1/nov vence 10/nov.
  const cards = [{ id: "nu", closingDay: 1, dueDay: 10 }];

  it("a conta pesa no dia; o cartão, no ciclo em que vence a fatura", () => {
    // De 25/out a 14/dez: 21 dias no ciclo atual, 30 no próximo.
    const spend = paceSpendByCycle(
      { accountPerDay: 10, cardPerDay: [{ cardId: "nu", perDay: 20 }] },
      periods,
      cards,
      new Date(2026, 9, 25),
    );
    // Cartão: 25/out a 1/nov (8 dias) vence 10/nov, no atual; 2/nov a 1/dez
    // (30 dias) vence 10/dez, no próximo; o resto vence em jan, fora.
    expect(spend).toEqual([21 * 10 + 8 * 20, 30 * 10 + 30 * 20]);
  });

  it("cartão apagado conta como a conta", () => {
    expect(
      paceSpendByCycle(
        { accountPerDay: 0, cardPerDay: [{ cardId: "velho", perDay: 5 }] },
        periods,
        cards,
        new Date(2026, 9, 25),
      ),
    ).toEqual([105, 150]);
  });
});

describe("paceAcrossCycles", () => {
  const cycle = (freeToSpend: number, endBalance = 0) => ({ freeToSpend, endBalance });

  it("a sobra do ciclo atual entra no seguinte, e o ritmo tira o que é de cada um", () => {
    // Sobram 1.500 − 1.050 = 450 agora; o próximo tem 2.787 e gasta 1.500.
    expect(paceAcrossCycles([1050, 1500], [cycle(1500), cycle(2787)])).toEqual([450, 1737]);
  });

  it("a falta do ritmo passa adiante, sem contar de novo a que a previsão já tinha", () => {
    // O atual já fechava em −1.000 pela previsão; o ritmo leva a −1.600. O
    // próximo já herda os −1.000 no livre dele: só os −600 a mais passam.
    expect(paceAcrossCycles([600, 1500], [cycle(0, -1000), cycle(2000)])).toEqual([-1600, -100]);
  });
});
