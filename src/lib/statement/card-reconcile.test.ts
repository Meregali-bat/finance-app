import { describe, expect, it } from "vitest";
import type { CardBillLine } from "./sicoob-card";
import { purchaseFromLine, reconcileCardBill, type AppCharge } from "./card-reconcile";
import { installmentSlices } from "@/lib/period";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const utc = (iso: string) => Math.floor(day(iso).getTime() / 86_400_000);
const line = (overrides: Partial<CardBillLine>): CardBillLine => ({
  date: day("2026-09-16"),
  description: "CITRAL",
  city: "TAQUARA",
  amount: 12.35,
  installment: null,
  fee: false,
  ...overrides,
});

describe("reconcileCardBill", () => {
  it("à vista confere pelo valor com até 3 dias, cada cobrança uma vez", () => {
    const app: AppCharge[] = [{ amount: 12.35, day: utc("2026-09-18"), installments: 1 }];
    expect(reconcileCardBill([line({}), line({})], app, "c").map((m) => m.matched)).toEqual([
      true,
      false,
    ]);
    expect(
      reconcileCardBill(
        [line({})],
        [{ amount: 12.35, day: utc("2026-09-25"), installments: 1 }],
        "c",
      )[0].matched,
    ).toBe(false);
  });

  it("parcelada e assinatura conferem pelo valor, com um centavo de folga", () => {
    const parcel = line({
      amount: 100,
      installment: { current: 5, total: 8 },
      date: day("2026-05-15"),
    });
    expect(
      reconcileCardBill(
        [parcel],
        [{ amount: 100.01, day: utc("2026-01-01"), installments: 8 }],
        "c",
      )[0].matched,
    ).toBe(true);
    const disney = line({ description: "Disney PlusV", amount: 49.9 });
    expect(
      reconcileCardBill([disney], [{ amount: 49.9, day: null, installments: 1 }], "c")[0].matched,
    ).toBe(true);
  });

  it("impressões diferentes para linhas iguais no mesmo dia", () => {
    const [a, b] = reconcileCardBill([line({}), line({})], [], "c");
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });
});

describe("purchaseFromLine", () => {
  const cycleEnd = day("2026-10-09");

  it("à vista: a própria linha", () => {
    expect(purchaseFromLine(line({}), cycleEnd)).toEqual({
      date: day("2026-09-16"),
      amount: 12.35,
      installments: 1,
      description: "Citral",
    });
  });

  it("parcela 5 de 8 vira 4x da parcela, só daqui para a frente", () => {
    const parcel = line({
      description: "JIM.COM LUCAS DE SOU",
      amount: 100,
      installment: { current: 5, total: 8 },
      date: day("2026-05-15"),
    });
    const purchase = purchaseFromLine(parcel, cycleEnd);
    expect(purchase).toEqual({
      date: cycleEnd,
      amount: 400,
      installments: 4,
      description: "Jim.com Lucas de Sou (parcelas 5 a 8 de 8)",
    });
    // A primeira das 4 cai na fatura que fecha no dia 09/10, e nenhuma antes.
    const slices = installmentSlices({ cardId: "c", ...purchase }, 9);
    expect(slices.map((s) => [s.cycleEnd.getMonth(), s.amount])).toEqual([
      [9, 100],
      [10, 100],
      [11, 100],
      [0, 100],
    ]);
  });

  it("última parcela: 1x", () => {
    const last = line({
      description: "REN*CFC TAQUARA",
      amount: 186.23,
      installment: { current: 12, total: 12 },
    });
    expect(purchaseFromLine(last, cycleEnd)).toMatchObject({
      amount: 186.23,
      installments: 1,
      description: "Ren*cfc Taquara (parcela 12 de 12)",
    });
  });
});
