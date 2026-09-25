import { describe, expect, it } from "vitest";
import { billLinesInRange } from "./history-bills";
import { buildCardBills } from "./period";

/** Um dia de calendário como o banco guarda: meia-noite UTC. */
const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

// Fecha dia 20, vence dia 28.
const card = { id: "c1", closingDay: 20, dueDay: 28 };
const october = { start: new Date(2026, 9, 1), end: new Date(2026, 10, 1) };

describe("billLinesInRange", () => {
  it("põe cada parcela no mês da fatura dela, e não a compra inteira no mês da compra", () => {
    const lines = billLinesInRange({
      card,
      purchases: [{ id: "p1", cardId: "c1", amount: 900, date: day(2026, 7, 25), installments: 3 }],
      ...october,
    });

    // 25/ago fecha em 20/set: 1ª parcela na fatura de 28/set, 2ª na de 28/out.
    expect(lines).toEqual([
      {
        kind: "installment",
        cardId: "c1",
        dueDate: new Date(2026, 9, 28),
        amount: 300,
        purchaseId: "p1",
        installmentNumber: 2,
        installmentCount: 3,
      },
    ]);
  });

  it("mostra a anuidade, a assinatura e a diferença do pagamento", () => {
    const lines = billLinesInRange({
      card,
      purchases: [{ id: "p1", cardId: "c1", amount: 200, date: day(2026, 9, 5) }],
      cardFixedExpenses: [{ id: "netflix", amount: 55, cardId: "c1", createdAt: new Date(2026, 0, 1) }],
      billEstimates: [{ id: "e1", cardId: "c1", dueDate: day(2026, 9, 28), amount: 40 }],
      // Pagou 310 por uma fatura prevista em 295: 15 de juros.
      expensePayments: [{ cardId: "c1", dueDate: day(2026, 9, 28), amount: 310 }],
      ...october,
    });

    expect(lines.map((l) => [l.kind, l.amount])).toEqual([
      ["installment", 200],
      ["subscription", 55],
      ["estimate", 40],
      ["adjustment", 15],
    ]);
  });

  it("soma exatamente o que a fatura cobrou — ou o que foi pago, quando foi", () => {
    const input = {
      card,
      purchases: [
        { id: "p1", cardId: "c1", amount: 1000, date: day(2026, 8, 25), installments: 3 },
        { id: "p2", cardId: "c1", amount: 80, date: day(2026, 9, 2) },
      ],
      cardFixedExpenses: [{ id: "netflix", amount: 55, cardId: "c1" }],
      billEstimates: [{ id: "e1", cardId: "c1", dueDate: day(2026, 9, 28), amount: 12.5 }],
    };
    const [bill] = buildCardBills({ ...input, from: october.start, months: 1 });
    const lines = billLinesInRange({ ...input, ...october });

    expect(lines.reduce((sum, l) => sum + l.amount, 0)).toBeCloseTo(bill.amount, 10);

    const paid = billLinesInRange({
      ...input,
      expensePayments: [{ cardId: "c1", dueDate: day(2026, 9, 28), amount: 400 }],
      ...october,
    });
    expect(paid.reduce((sum, l) => sum + l.amount, 0)).toBeCloseTo(400, 10);
  });

  it("não mostra diferença quando a fatura ainda não foi paga", () => {
    const lines = billLinesInRange({
      card,
      purchases: [{ id: "p1", cardId: "c1", amount: 200, date: day(2026, 9, 5) }],
      ...october,
    });

    expect(lines.map((l) => l.kind)).toEqual(["installment"]);
  });

  it("ignora as compras de outro cartão", () => {
    const lines = billLinesInRange({
      card,
      purchases: [{ id: "p1", cardId: "outro", amount: 200, date: day(2026, 9, 5) }],
      ...october,
    });

    expect(lines).toEqual([]);
  });
});
