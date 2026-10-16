import { describe, expect, it } from "vitest";
import { cumulativeDailySpending } from "./spending-trend";

const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

describe("cumulativeDailySpending", () => {
  it("acumula lançamentos de saída e compras no cartão, um ponto por dia", () => {
    const points = cumulativeDailySpending({
      start: new Date(2026, 9, 5),
      today: new Date(2026, 9, 8),
      transactions: [
        { amount: 50, date: day(2026, 9, 5) },
        { amount: -1000, date: day(2026, 9, 6) },
        { amount: 30, date: day(2026, 9, 7) },
      ],
      cardPurchases: [{ amount: 200, date: day(2026, 9, 7) }],
    });

    expect(points.map((p) => p.total)).toEqual([50, 50, 280, 280]);
    expect(points[0].day).toEqual(new Date(2026, 9, 5));
  });

  it("ignora o que cai fora do período", () => {
    const points = cumulativeDailySpending({
      start: new Date(2026, 9, 5),
      today: new Date(2026, 9, 6),
      transactions: [{ amount: 99, date: day(2026, 9, 4) }],
      cardPurchases: [{ amount: 99, date: day(2026, 9, 7) }],
    });

    expect(points.map((p) => p.total)).toEqual([0, 0]);
  });
});
