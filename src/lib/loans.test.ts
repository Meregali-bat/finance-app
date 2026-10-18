import { describe, expect, it } from "vitest";
import { loanSchedule, summarizeDebts } from "./loans";

const today = new Date(2026, 9, 18);

describe("summarizeDebts", () => {
  it("soma o que cada pessoa deve e desconta o que ela devolveu", () => {
    const [joao] = summarizeDebts({
      loans: [
        { id: "a", personId: "joao", amount: 60, date: new Date(2026, 9, 3), installments: 1 },
        { id: "b", personId: "joao", amount: 200, date: new Date(2026, 9, 10), installments: 1 },
      ],
      repayments: [{ personId: "joao", amount: 100 }],
      today,
    });
    expect(joao).toMatchObject({ owed: 260, paid: 100, remaining: 160 });
    // O pagamento quita o mais antigo e abate o resto do seguinte.
    expect(joao.loans).toEqual([
      { id: "a", amount: 60, paid: 60, remaining: 0 },
      { id: "b", amount: 200, paid: 40, remaining: 160 },
    ]);
    expect(joao.since).toEqual(new Date(2026, 9, 10));
  });

  it("some quem já devolveu tudo", () => {
    const debts = summarizeDebts({
      loans: [{ id: "a", personId: "ana", amount: 50, date: today, installments: 1 }],
      repayments: [{ personId: "ana", amount: 50 }],
      today,
    });
    expect(debts).toEqual([]);
  });

  it("aponta a próxima parcela combinada, com o que falta dela", () => {
    const [maria] = summarizeDebts({
      loans: [
        {
          id: "a",
          personId: "maria",
          amount: 300,
          date: new Date(2026, 8, 20),
          installments: 3,
          firstDueDate: new Date(2026, 9, 10),
        },
      ],
      repayments: [{ personId: "maria", amount: 130 }],
      today,
    });
    // Pagou a 1ª (100) e 30 da 2ª: falta 70 da 2ª, que vence 10/nov.
    expect(maria.next).toEqual({
      loanId: "a",
      number: 2,
      installments: 3,
      dueDate: new Date(2026, 10, 10),
      amount: 70,
      overdue: false,
    });
  });

  it("marca a parcela vencida", () => {
    const [maria] = summarizeDebts({
      loans: [
        {
          id: "a",
          personId: "maria",
          amount: 100,
          date: new Date(2026, 8, 1),
          installments: 1,
          firstDueDate: new Date(2026, 9, 1),
        },
      ],
      repayments: [],
      today,
    });
    expect(maria.next).toMatchObject({ number: 1, amount: 100, overdue: true });
  });
});

describe("loanSchedule", () => {
  it("põe os centavos da divisão na primeira parcela e avança mês a mês", () => {
    const schedule = loanSchedule({
      amount: 100,
      installments: 3,
      firstDueDate: new Date(2026, 0, 31),
    });
    expect(schedule.map((s) => s.cumulative)).toEqual([33.34, 66.67, 100]);
    // 31/jan → 28/fev → 31/mar.
    expect(schedule.map((s) => s.dueDate)).toEqual([
      new Date(2026, 0, 31),
      new Date(2026, 1, 28),
      new Date(2026, 2, 31),
    ]);
  });

  it("sem data combinada não há parcelas", () => {
    expect(loanSchedule({ amount: 100, installments: 3 })).toEqual([]);
  });
});
