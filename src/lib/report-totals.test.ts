import { describe, expect, it } from "vitest";
import { calculateReportTotals } from "./report-totals";
import type { HistoryItem } from "./history-item";

function item(overrides: Partial<HistoryItem> & Pick<HistoryItem, "amount">): HistoryItem {
  return {
    id: "x",
    kind: "transaction",
    description: "Lançamento",
    date: new Date(2026, 7, 3),
    categoryId: null,
    ...overrides,
  };
}

// Agosto de 2026, um mês já encerrado do ponto de vista de "hoje = 10/set".
const august = { rangeStart: new Date(2026, 7, 1), rangeEnd: new Date(2026, 8, 1) };
const afterAugust = new Date(2026, 8, 10);

describe("calculateReportTotals", () => {
  it("soma os gastos do período", () => {
    const totals = calculateReportTotals({
      items: [item({ amount: 100 }), item({ amount: 50.5 })],
      ...august,
      today: afterAugust,
    });
    expect(totals.spent).toBe(150.5);
  });

  it("deixa a fatura paga de fora do gasto, porque as compras dela já contam uma a uma", () => {
    const totals = calculateReportTotals({
      items: [item({ kind: "card", amount: 100 }), item({ kind: "cardBillPayment", amount: 100 })],
      ...august,
      today: afterAugust,
    });
    expect(totals.spent).toBe(100);
  });

  it("conta a despesa fixa paga como gasto, já que ela não aparece em outro lugar", () => {
    const totals = calculateReportTotals({
      items: [item({ kind: "fixedExpensePayment", amount: 800 })],
      ...august,
      today: afterAugust,
    });
    expect(totals.spent).toBe(800);
  });

  it("conta a receita fixa confirmada como recebida", () => {
    const totals = calculateReportTotals({
      items: [item({ kind: "incomeReceipt", amount: -4500 })],
      ...august,
      today: afterAugust,
    });
    expect(totals.received).toBe(4500);
    expect(totals.spent).toBe(0);
  });

  it("separa a receita do gasto e a devolve positiva", () => {
    const totals = calculateReportTotals({
      items: [item({ amount: -2000 }), item({ amount: 300 })],
      ...august,
      today: afterAugust,
    });
    expect(totals.received).toBe(2000);
    expect(totals.spent).toBe(300);
  });

  it("apura o saldo como recebido menos gasto", () => {
    const totals = calculateReportTotals({
      items: [item({ amount: -2000 }), item({ amount: 300 })],
      ...august,
      today: afterAugust,
    });
    expect(totals.balance).toBe(1700);
  });

  it("mostra saldo negativo quando se gastou mais do que entrou", () => {
    const totals = calculateReportTotals({
      items: [item({ amount: -100 }), item({ amount: 400 })],
      ...august,
      today: afterAugust,
    });
    expect(totals.balance).toBe(-300);
  });

  it("divide o gasto pelos dias inteiros de um período já encerrado", () => {
    const totals = calculateReportTotals({
      items: [item({ amount: 310 })],
      ...august, // 31 dias
      today: afterAugust,
    });
    expect(totals.dailyAverage).toBeCloseTo(10);
  });

  it("divide só pelos dias decorridos quando o período ainda está em curso", () => {
    // No dia 5, contar os 31 dias de agosto faria o gasto parecer seis vezes
    // menor do que o ritmo real.
    const totals = calculateReportTotals({
      items: [item({ amount: 500 })],
      ...august,
      today: new Date(2026, 7, 5, 14, 30),
    });
    expect(totals.dailyAverage).toBeCloseTo(100); // 5 dias decorridos
  });

  it("não divide por zero num período que ainda nem começou", () => {
    const totals = calculateReportTotals({
      items: [],
      ...august,
      today: new Date(2026, 6, 20),
    });
    expect(totals.dailyAverage).toBe(0);
  });

  it("zera tudo sem lançamento nenhum", () => {
    const totals = calculateReportTotals({ items: [], ...august, today: afterAugust });
    expect(totals).toEqual({ spent: 0, received: 0, saved: 0, balance: 0, dailyAverage: 0 });
  });
});

describe("assinatura cobrada no cartão", () => {
  it("conta como gasto, já que a fatura que a cobra fica de fora", () => {
    const totals = calculateReportTotals({
      items: [
        item({ kind: "card", amount: 200, description: "Mercado" }),
        item({ kind: "cardFixedExpense", amount: 55, description: "Netflix" }),
        item({ kind: "cardBillPayment", amount: 255, description: "Fatura do Nubank" }),
      ],
      ...august,
      today: afterAugust,
    });

    // 200 da compra + 55 da assinatura. A fatura de 255 sai, senão o mesmo
    // dinheiro contaria duas vezes.
    expect(totals.spent).toBe(255);
  });
});

describe("caixinhas e diferenças de fatura", () => {
  it("separa o guardado do gasto, e tira do saldo o que foi para a caixinha", () => {
    const totals = calculateReportTotals({
      items: [
        item({ kind: "incomeReceipt", amount: -5000 }),
        item({ kind: "transaction", amount: 1000 }),
        item({ kind: "jarDeposit", amount: 800 }),
        item({ kind: "jarDeposit", amount: -300 }),
      ],
      ...august,
      today: afterAugust,
    });

    expect(totals.spent).toBe(1000);
    expect(totals.received).toBe(5000);
    expect(totals.saved).toBe(500);
    expect(totals.balance).toBe(3500);
  });

  it("conta a diferença da fatura como gasto, com o sinal que tiver", () => {
    const totals = calculateReportTotals({
      items: [
        item({ kind: "card", amount: 200 }),
        item({ kind: "cardBillAdjustment", amount: 15 }),
        item({ kind: "cardBillAdjustment", amount: -40 }),
      ],
      ...august,
      today: afterAugust,
    });

    expect(totals.spent).toBe(175);
    expect(totals.received).toBe(0);
  });
});
