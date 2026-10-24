import { describe, expect, it } from "vitest";
import { itemDayKey, type HistoryItem } from "./history-item";

const base: HistoryItem = {
  id: "x",
  kind: "transaction",
  description: "Gasolina",
  amount: 150,
  date: new Date(Date.UTC(2026, 9, 20)),
  categoryId: null,
};

describe("itemDayKey", () => {
  it("lançamento pelo dia de calendário guardado em UTC", () => {
    expect(itemDayKey(base)).toBe("2026-10-20");
  });

  it("parcela do cartão pelo dia da compra, não pelo vencimento da fatura", () => {
    expect(
      itemDayKey({
        ...base,
        kind: "card",
        date: new Date(2026, 10, 10),
        purchaseDate: new Date(Date.UTC(2026, 9, 19)),
      }),
    ).toBe("2026-10-19");
  });

  it("pagamento e confirmação pelo dia local do instante", () => {
    expect(
      itemDayKey({ ...base, kind: "fixedExpensePayment", date: new Date(2026, 9, 8, 22, 30) }),
    ).toBe("2026-10-08");
  });
});
