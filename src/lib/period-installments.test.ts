import { describe, expect, it } from "vitest";
import { installmentSpan, installmentsLeft, installmentsStart, openInstallments } from "./period";

// Um empréstimo de 12 parcelas de R$ 350, vencendo dia 10, a primeira em
// 10/jul/2026. Em 31/out, a próxima é a 5ª (10/nov).
const loan = {
  id: "emprestimo",
  amount: 350,
  dueDay: 10,
  createdAt: new Date(2026, 5, 1),
  installmentCount: 12,
  installmentsFrom: new Date(Date.UTC(2026, 6, 10)),
};
const today = new Date(2026, 9, 31);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

describe("openInstallments", () => {
  it("lista as que faltam com o número e o vencimento, sem as já pagas", () => {
    const open = openInstallments(loan, today, [utc(2027, 3, 10), utc(2027, 4, 10)]);
    expect(open.map((i) => i.number)).toEqual([5, 6, 7, 8, 9, 12]);
    expect(open[0]).toEqual({ number: 5, dueDate: new Date(2026, 10, 10), amount: 350 });
  });

  it("nada sem número de parcelas", () => {
    expect(openInstallments({ ...loan, installmentCount: undefined }, today, [])).toEqual([]);
  });
});

describe("installmentsLeft com parcelas adiantadas fora de ordem", () => {
  it("não conta as pagas do meio nem do fim, e a última é a última que falta", () => {
    expect(installmentsLeft(loan, today, [utc(2027, 4, 10), utc(2027, 5, 10)])).toEqual({
      remaining: 6,
      last: new Date(2027, 3, 10),
    });
    expect(installmentsLeft(loan, today, [utc(2027, 0, 10)])?.remaining).toBe(7);
  });

  it("todas pagas: zero, e a última continua a do contrato", () => {
    const all = openInstallments(loan, today, []).map((i) =>
      utc(i.dueDate.getFullYear(), i.dueDate.getMonth(), i.dueDate.getDate()),
    );
    expect(installmentsLeft(loan, today, all)).toEqual({
      remaining: 0,
      last: new Date(2027, 5, 10),
    });
  });
});

describe("installmentSpan", () => {
  it("salvar 'faltam N' de novo cobre as pagas do meio", () => {
    // Faltam 5 (nov, dez, mar, abr, mai), com jan e fev pagas: do próximo
    // vencimento, as 5 que faltam ocupam 7 meses.
    const paid = [utc(2027, 0, 10), utc(2027, 1, 10)];
    const from = installmentsStart(10, today, paid);
    expect(installmentSpan(10, from, 5, paid)).toBe(7);
    const saved = { ...loan, installmentsFrom: from, installmentCount: 7 };
    expect(installmentsLeft(saved, today, paid)?.remaining).toBe(5);
  });

  it("sem pagas no meio, é o próprio número", () => {
    expect(installmentSpan(10, utc(2026, 10, 10), 3, [utc(2027, 5, 10)])).toBe(3);
  });
});
