import { describe, expect, it } from "vitest";
import { paceAcrossCycles, spendingPace } from "./spending-pace";

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
  it("leva a média do ciclo até o fim dele", () => {
    const pace = spendingPace({
      ...base,
      freeToSpend: 1500,
      transactions: [
        { amount: 300, date: utc(10, 16) },
        { amount: 200, date: utc(10, 24) },
      ],
    })!;
    expect(pace).toMatchObject({ spent: 500, elapsedDays: 10, perDay: 50, remainingDays: 21 });
    expect(pace.projectedSpending).toBe(1050);
    expect(pace.projectedLeft).toBe(450);
    expect(pace.cutPerDay).toBe(0);
  });

  it("vai faltar: diz quanto a menos por dia fecha a conta", () => {
    const pace = spendingPace({
      ...base,
      freeToSpend: 630,
      transactions: [{ amount: 1000, date: utc(10, 20) }],
    })!;
    // R$ 100 por dia × 21 dias = 2.100; faltam 1.470, R$ 70 por dia.
    expect(pace.projectedLeft).toBe(-1470);
    expect(pace.cutPerDay).toBe(70);
  });

  it("compra parcelada entra pela parcela; receita, fechamento e fora do ciclo não", () => {
    const pace = spendingPace({
      ...base,
      freeToSpend: 1000,
      transactions: [
        { amount: -5000, date: utc(10, 15) },
        { amount: 80, date: utc(10, 15), fromPeriodClose: true },
        { amount: 70, date: utc(10, 14) },
        { amount: 90, date: utc(10, 25) },
        { amount: 100, date: utc(10, 18) },
      ],
      cardPurchases: [{ amount: 1200, date: utc(10, 20), installments: 12 }],
    })!;
    expect(pace.spent).toBe(200);
  });

  it("nos primeiros dias, ou sem gasto, não projeta", () => {
    expect(
      spendingPace({
        ...base,
        today: new Date(2026, 9, 16),
        freeToSpend: 1000,
        transactions: [{ amount: 50, date: utc(10, 15) }],
      }),
    ).toBeNull();
    expect(spendingPace({ ...base, freeToSpend: 1000 })).toBeNull();
  });
});

describe("paceAcrossCycles", () => {
  const cycle = (offset: number, freeToSpend: number, endBalance = 0, totalDays = 30) => ({
    offset,
    totalDays,
    freeToSpend,
    endBalance,
  });

  it("a sobra do ciclo atual entra no seguinte, e o ritmo gasta os dias dele", () => {
    // Sobram 450 agora; o próximo tem 2.787 livres e 30 dias a R$ 50.
    expect(
      paceAcrossCycles({ perDay: 50, projectedLeft: 450 }, [cycle(0, 1500), cycle(1, 2787)]),
    ).toEqual([450, 1737]);
  });

  it("a falta do ritmo passa adiante, sem contar de novo a que a previsão já tinha", () => {
    // O atual já fechava em −1.000 pela previsão; o ritmo leva a −1.600. O
    // próximo já herda os −1.000 no livre dele: só os −600 a mais passam.
    expect(
      paceAcrossCycles({ perDay: 50, projectedLeft: -1600 }, [cycle(0, 0, -1000), cycle(1, 2000)]),
    ).toEqual([-1600, -100]);
  });
});
