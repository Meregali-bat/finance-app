import { describe, expect, it } from "vitest";
import { tomorrowDaily } from "./tomorrow-daily";

describe("tomorrowDaily", () => {
  it("o mesmo bolo dividido por um dia a menos", () => {
    // R$ 200 livres em 10 dias: 20 hoje; sem gasto, 200 / 9 amanhã.
    expect(tomorrowDaily({ dailyAvailable: 20, daysRemaining: 10 })).toBeCloseTo(200 / 9);
  });

  it("com dois dias, amanhã leva o bolo inteiro", () => {
    expect(tomorrowDaily({ dailyAvailable: 15, daysRemaining: 2 })).toBe(30);
  });

  it("no último dia não há amanhã dentro do período", () => {
    expect(tomorrowDaily({ dailyAvailable: 15, daysRemaining: 1 })).toBeNull();
  });

  it("zero continua zero: nada a prometer", () => {
    expect(tomorrowDaily({ dailyAvailable: 0, daysRemaining: 10 })).toBeNull();
  });

  it("negativo não vira promessa", () => {
    expect(tomorrowDaily({ dailyAvailable: -5, daysRemaining: 10 })).toBeNull();
  });

  it("sem subir um centavo, não diz que sobe", () => {
    // 0,01 em 30 dias: amanhã 0,0103..., que arredonda para o mesmo centavo.
    expect(tomorrowDaily({ dailyAvailable: 0.01, daysRemaining: 30 })).toBeNull();
  });
});
