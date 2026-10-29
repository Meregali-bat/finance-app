import { describe, expect, it } from "vitest";
import { heroTone, TIGHT_SHARE } from "./hero-tone";

// Período de 30 dias, faltam 10 contando hoje. Sem gasto, o livre restante
// dividido por 30 é o ritmo de abertura.
const base = {
  dailyAvailable: 100,
  daysRemaining: 10,
  totalDays: 30,
  spentInPeriod: 2000,
  spentToday: 0,
  savingsApplied: 0,
};
// Abertura: (100 * 10 + 2000) / 30 = 100 por dia.

describe("heroTone", () => {
  it("normal quando o dia está no ritmo de abertura", () => {
    expect(heroTone(base)).toBe("normal");
  });

  it("negativo vence tudo", () => {
    expect(heroTone({ ...base, dailyAvailable: -5, spentToday: 50 })).toBe("negative");
  });

  it("zero com reserva de guardar é escolha, não aperto", () => {
    expect(heroTone({ ...base, dailyAvailable: 0, savingsApplied: 300 })).toBe("allToSavings");
  });

  it("zero sem reserva é apertado", () => {
    expect(heroTone({ ...base, dailyAvailable: 0, spentInPeriod: 2900 })).toBe("tight");
  });

  it("apertado abaixo de 25% do ritmo de abertura", () => {
    // Abertura: (20 * 10 + 2800) / 30 = 100; 20 < 25.
    expect(heroTone({ ...base, dailyAvailable: 20, spentInPeriod: 2800 })).toBe("tight");
    expect(TIGHT_SHARE).toBe(0.25);
  });

  it("no limite dos 25% ainda é normal", () => {
    // Abertura: (25 * 10 + 2750) / 30 = 100; 25 não é menor que 25.
    expect(heroTone({ ...base, dailyAvailable: 25, spentInPeriod: 2750 })).toBe("normal");
  });

  it("apertado quando hoje já saiu mais que o dia médio que sobra", () => {
    expect(heroTone({ ...base, spentToday: 120 })).toBe("tight");
    expect(heroTone({ ...base, spentToday: 80 })).toBe("normal");
  });

  it("sem dinheiro nenhum no período, não inventa aperto", () => {
    expect(
      heroTone({ ...base, dailyAvailable: 0, spentInPeriod: 0, daysRemaining: 30 }),
    ).toBe("normal");
  });

  it("período de zero dias não divide por zero", () => {
    expect(heroTone({ ...base, totalDays: 0 })).toBe("normal");
  });
});
