import { describe, expect, it } from "vitest";
import {
  keepFingerprint,
  linkedAmount,
  prepareShotLines,
  reconcileShots,
  type AppPurchase,
  type RawShotLine,
  type ShotLine,
} from "./card-screenshots";

const today = new Date("2026-10-30T12:00:00.000Z");
const raw = (overrides: Partial<RawShotLine>): RawShotLine => ({
  description: "FARMACIA SAO JOAO",
  day: 29,
  month: 10,
  time: "13:19",
  amount: 14.99,
  status: "pendente",
  kind: "compra",
  ...overrides,
});
const shot = (overrides: Partial<ShotLine>): ShotLine => ({
  fingerprint: "f",
  date: "2026-10-20",
  time: "18:22",
  description: "CITRAL",
  amount: 12.35,
  ...overrides,
});
const purchase = (overrides: Partial<AppPurchase>): AppPurchase => ({
  id: "p",
  description: "Citral",
  date: "2026-10-20",
  amount: 12.35,
  installments: 1,
  ...overrides,
});

describe("prepareShotLines", () => {
  it("junta a mesma linha vista em duas prints", () => {
    const { lines, skipped } = prepareShotLines(
      [raw({}), raw({ description: "Farmacia  Sao Joao" }), raw({ time: "20:05" })],
      "c",
      today,
    );
    expect(lines).toHaveLength(2);
    expect(skipped).toBe(0);
  });

  it("deixa de fora negadas, canceladas, desconhecidas e o que não é compra", () => {
    const { lines, skipped } = prepareShotLines(
      [
        raw({ status: "processado", time: "01:00" }),
        raw({ status: "pendente", time: "02:00" }),
        raw({ status: "negado", time: "03:00" }),
        raw({ status: "cancelado", time: "04:00" }),
        raw({ status: "desconhecido", amount: 0, time: "05:00" }),
        raw({ kind: "outro", time: "06:00" }),
      ],
      "c",
      today,
    );
    expect(lines.map((l) => l.time)).toEqual(["02:00", "01:00"]);
    expect(skipped).toBe(4);
  });

  it("monta data, impressão e ordem da mais recente", () => {
    const { lines } = prepareShotLines(
      [raw({ day: 3, month: 10 }), raw({ day: 29, month: 10, amount: 23.6 })],
      "c",
      today,
    );
    expect(lines.map((l) => l.date)).toEqual(["2026-10-29", "2026-10-03"]);
    expect(lines[0].fingerprint).toBe("shot|c|2026-10-29|13:19|2360|farmacia sao joao");
  });

  it("um mês depois do atual é do ano passado", () => {
    const { lines } = prepareShotLines(
      [raw({ day: 28, month: 12 })],
      "c",
      new Date("2027-01-05T12:00:00.000Z"),
    );
    expect(lines[0].date).toBe("2026-12-28");
  });
});

describe("reconcileShots", () => {
  it("casa pelo valor com até 3 dias, cada compra uma vez", () => {
    const result = reconcileShots(
      [shot({ fingerprint: "a" }), shot({ fingerprint: "b" })],
      [purchase({ date: "2026-10-23" })],
    );
    expect(result.matched.map((m) => m.line.fingerprint)).toEqual(["a"]);
    expect(result.onlyBank.map((l) => l.fingerprint)).toEqual(["b"]);
    expect(
      reconcileShots([shot({})], [purchase({ date: "2026-10-24" })]).onlyBank,
    ).toHaveLength(1);
  });

  it("casa uma parcelada pelo total ou pela parcela", () => {
    const app = [purchase({ amount: 300, installments: 3 })];
    expect(reconcileShots([shot({ amount: 100 })], app).matched).toHaveLength(1);
    expect(reconcileShots([shot({ amount: 300 })], app).matched).toHaveLength(1);
  });

  it("só no app olha o período das prints; o total do app soma o que casou", () => {
    const result = reconcileShots(
      [shot({ date: "2026-10-20" }), shot({ date: "2026-10-25", amount: 50 })],
      [
        purchase({ id: "dentro", date: "2026-10-22", amount: 9 }),
        purchase({ id: "antes-casa", date: "2026-10-18" }),
        purchase({ id: "antes", date: "2026-10-10", amount: 7 }),
      ],
    );
    expect(result.period).toEqual({ start: "2026-10-20", end: "2026-10-25" });
    expect(result.matched.map((m) => m.purchase.id)).toEqual(["antes-casa"]);
    expect(result.onlyApp.map((p) => p.id)).toEqual(["dentro"]);
    expect(result.bankTotal).toBe(62.35);
    expect(result.appTotal).toBe(21.35);
  });
});

describe("linkedAmount", () => {
  it("à vista é o valor do banco; parcelada, a parcela vezes as parcelas", () => {
    expect(linkedAmount(43.25, 1)).toBe(43.25);
    expect(linkedAmount(100, 3)).toBe(300);
    expect(linkedAmount(33.33, 3)).toBe(99.99);
  });
});

it("keepFingerprint", () => {
  expect(keepFingerprint("abc")).toBe("keep|abc");
});
