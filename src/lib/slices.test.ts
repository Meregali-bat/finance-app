import { describe, expect, it } from "vitest";
import {
  crossedNinety,
  DEFAULT_SLICES,
  parseSlices,
  savingPercent,
  savingReserve,
  sliceOfCategory,
  sliceUsage,
} from "./slices";

describe("parseSlices", () => {
  it("aceita só inteiros de 0 a 100 somando 100", () => {
    expect(parseSlices(DEFAULT_SLICES)).toEqual(DEFAULT_SLICES);
    expect(parseSlices({ ...DEFAULT_SLICES, freedom: 26 })).toBeNull();
    expect(parseSlices({ ...DEFAULT_SLICES, freedom: 24.5, fixed: 30.5 })).toBeNull();
    expect(parseSlices({ ...DEFAULT_SLICES, freedom: -5, fixed: 60 })).toBeNull();
    expect(parseSlices(null)).toBeNull();
    expect(parseSlices({ freedom: 100 })).toBeNull();
  });

  it("as fatias de guardar são Metas e Liberdade financeira", () => {
    expect(savingPercent(DEFAULT_SLICES)).toBe(40);
  });
});

describe("sliceOfCategory", () => {
  it("a escolha da pessoa vale mais que o palpite", () => {
    expect(sliceOfCategory({ name: "Lazer", slice: "knowledge" })).toBe("knowledge");
  });
  it.each([
    ["Moradia", "fixed"],
    ["Saúde", "fixed"],
    ["Transporte", "fixed"],
    ["Alimentação", "comfort"],
    ["Lazer", "pleasure"],
    ["Educação", "knowledge"],
    ["Outros", "comfort"],
  ])("%s → %s", (name, slice) => {
    expect(sliceOfCategory({ name, slice: null })).toBe(slice);
  });
});

describe("savingReserve", () => {
  it("reserva o que falta guardar, sem contar de novo o que já está nas caixinhas", () => {
    expect(
      savingReserve({ income: 6000, percents: DEFAULT_SLICES, saved: 1000, spendable: 3000 }),
    ).toEqual({ target: 2400, saved: 1000, remaining: 1400, applied: 1400, shortfall: 0 });
  });

  it("nunca reserva mais do que há: o resto vira falta", () => {
    expect(
      savingReserve({ income: 6000, percents: DEFAULT_SLICES, saved: 0, spendable: 900 }),
    ).toEqual({ target: 2400, saved: 0, remaining: 2400, applied: 900, shortfall: 1500 });
  });

  it("guardou mais que a meta, ou o período já está no vermelho: nada a reservar", () => {
    expect(
      savingReserve({ income: 6000, percents: DEFAULT_SLICES, saved: 3000, spendable: 500 })
        .applied,
    ).toBe(0);
    expect(
      savingReserve({ income: 6000, percents: DEFAULT_SLICES, saved: 0, spendable: -200 }),
    ).toMatchObject({ applied: 0, shortfall: 2400 });
  });

  it("sem renda no período, sem reserva", () => {
    expect(
      savingReserve({ income: 0, percents: DEFAULT_SLICES, saved: 0, spendable: 1000 }).target,
    ).toBe(0);
  });
});

describe("sliceUsage", () => {
  it("cada fatia contra o seu pedaço da renda; as de guardar contam as caixinhas", () => {
    const usage = sliceUsage({
      income: 5000,
      percents: DEFAULT_SLICES,
      spending: [
        { slice: "fixed", amount: 1200 },
        { slice: "fixed", amount: 300 },
        { slice: "pleasure", amount: 600 },
      ],
      saved: [{ slice: "freedom", amount: 500 }],
    });
    const by = Object.fromEntries(usage.map((u) => [u.key, u]));
    expect(by.fixed).toMatchObject({ limit: 1500, used: 1500, percentUsed: 100, count: 2 });
    expect(by.pleasure).toMatchObject({ limit: 500, used: 600, percentUsed: 120 });
    expect(by.freedom).toMatchObject({ limit: 1250, used: 500, percentUsed: 40 });
    expect(by.knowledge).toMatchObject({ used: 0, percentUsed: 0, count: 0 });
  });
});

describe("crossedNinety", () => {
  const usage = (used: number) => ({
    key: "pleasure" as const,
    limit: 500,
    used,
    percentUsed: (used / 500) * 100,
    count: 1,
  });
  it("avisa só na compra que atravessa os 90%", () => {
    expect(crossedNinety(usage(460), 40)).toBe(true);
    expect(crossedNinety(usage(480), 10)).toBe(false);
    expect(crossedNinety(usage(300), 50)).toBe(false);
  });
});
