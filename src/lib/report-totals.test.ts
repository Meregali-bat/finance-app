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
    expect(totals).toEqual({ spent: 0, received: 0, balance: 0, dailyAverage: 0 });
  });
});
