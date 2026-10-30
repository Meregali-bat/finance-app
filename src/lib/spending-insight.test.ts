import { describe, expect, it } from "vitest";
import {
  categoryTotals,
  closeProposal,
  groupOpenSpending,
  sliceSnapshot,
  type CategoryInfo,
  type SpendItem,
} from "./spending-insight";
import { sumPercents } from "./slices";

const categories = new Map<string, CategoryInfo>([
  ["alim", { id: "alim", name: "Alimentação", slice: "comfort" }],
  ["outros", { id: "outros", name: "Outros", slice: "comfort" }],
  ["lazer", { id: "lazer", name: "Lazer", slice: "pleasure" }],
]);
const item = (overrides: Partial<SpendItem>): SpendItem => ({
  kind: "card",
  id: "i",
  description: "Frutos da Terra",
  amount: 10,
  categoryId: null,
  slice: null,
  ...overrides,
});

describe("groupOpenSpending", () => {
  it("agrupa só os sem categoria ou em Outros, pela descrição", () => {
    const { groups, smallTotal } = groupOpenSpending(
      [
        item({ id: "a" }),
        item({ id: "b", description: "FRUTOS DA TERRA", categoryId: "outros", amount: 5 }),
        item({ id: "c", categoryId: "alim" }),
        item({ id: "d", description: "Posto", amount: 50 }),
      ],
      categories,
    );
    expect(groups.map((g) => [g.key, g.count, g.total])).toEqual([
      ["posto", 1, 50],
      ["frutos da terra", 2, 15],
    ]);
    expect(groups[1].items).toEqual([
      { kind: "card", id: "a" },
      { kind: "card", id: "b" },
    ]);
    expect(smallTotal).toBe(0);
  });

  it("o que passa do limite vira um total à parte", () => {
    const { groups, smallTotal } = groupOpenSpending(
      [item({ id: "a", amount: 30 }), item({ id: "b", description: "Egr", amount: 6.3 })],
      categories,
      1,
    );
    expect(groups).toHaveLength(1);
    expect(smallTotal).toBe(6.3);
  });
});

it("categoryTotals soma só os já categorizados", () => {
  expect(
    categoryTotals(
      [item({ categoryId: "lazer", amount: 40 }), item({ categoryId: "lazer" }), item({})],
      categories,
    ),
  ).toEqual([{ name: "Lazer", slice: "pleasure", total: 50, count: 2 }]);
});

describe("sliceSnapshot", () => {
  it("por período, com a fatia do item acima da categoria e a sugestão da IA", () => {
    const snap = sliceSnapshot({
      items: [
        item({ categoryId: "alim", amount: 600 }),
        item({ categoryId: "alim", amount: 300, slice: "pleasure" }),
        item({ description: "Posto", amount: 150 }),
        item({ description: "Sem palpite", amount: 90 }),
      ],
      categoriesById: categories,
      suggestedSlice: new Map([["posto", "fixed"]]),
      saved: [{ slice: "freedom", amount: 300 }],
      income: 3000,
      periods: 3,
    });
    const by = Object.fromEntries(snap.slices.map((s) => [s.key, s]));
    expect(by.comfort).toEqual({ key: "comfort", perPeriod: 200, percent: 20 });
    expect(by.pleasure.perPeriod).toBe(100);
    expect(by.fixed.perPeriod).toBe(50);
    expect(by.freedom.perPeriod).toBe(100);
    expect(snap.uncategorized).toBe(30);
    expect(snap.incomePerPeriod).toBe(1000);
    expect(snap.leftover).toBe(1000 - 200 - 100 - 50 - 30 - 100);
  });
});

describe("closeProposal", () => {
  it("fecha em 100 jogando a diferença na maior fatia de gastar", () => {
    const p = closeProposal({ freedom: 10, fixed: 40, comfort: 20, goals: 5, pleasure: 15, knowledge: 7 });
    expect(sumPercents(p)).toBe(100);
    expect(p.fixed).toBe(43);
    const q = closeProposal({ freedom: 20.6, fixed: 50, comfort: 30, goals: 10, pleasure: -3 });
    expect(sumPercents(q)).toBe(100);
    expect(q.pleasure).toBe(0);
    expect(q.knowledge).toBe(0);
    expect(q.fixed).toBe(39);
  });
});
