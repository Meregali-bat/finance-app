import { describe, expect, it } from "vitest";
import { loanAmount, loanAmounts, parseLoanFields } from "./loan-sync";

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
}

describe("quanto a pessoa deve", () => {
  it("metade do almoço dividido", () => {
    const fields = parseLoanFields(
      form({ lent: "1", "lent.0.personName": "Ana", "lent.0.share": String(1 / 2) }),
    )!;
    expect(loanAmount(fields.people[0], 87.3)).toBe(43.65);
  });

  it("um terço, em centavos", () => {
    expect(loanAmount({ share: 1 / 3 }, 100)).toBe(33.33);
  });

  it("o valor digitado vale mais que o atalho", () => {
    expect(loanAmount({ amount: 20, share: 1 / 2 }, 87.3)).toBe(20);
  });

  it("sem valor nem atalho, a despesa inteira", () => {
    expect(loanAmount({}, 87.3)).toBe(87.3);
  });

  it("uma parte maior que a despesa não passa", () => {
    expect(() =>
      parseLoanFields(form({ lent: "1", "lent.0.personName": "Ana", "lent.0.share": "1.5" })),
    ).toThrow();
  });
});

describe("conta dividida com várias pessoas", () => {
  it("lê cada pessoa da sua linha, com as parcelas valendo para todas", () => {
    const fields = parseLoanFields(
      form({
        lent: "1",
        "lent.0.personId": "p1",
        "lent.0.share": String(1 / 3),
        "lent.1.personName": "Bruno",
        "lent.1.amount": "25",
        lentInstallments: "2",
      }),
    )!;
    expect(fields.people).toEqual([
      { personId: "p1", share: 1 / 3 },
      { personName: "Bruno", amount: 25 },
    ]);
    expect(fields.installments).toBe(2);
  });

  it("dividido em três com você: cada um deve um terço", () => {
    expect(loanAmounts([{ share: 1 / 3 }, { share: 1 / 3 }], 90)).toEqual([30, 30]);
  });

  it("partes que fecham a despesa somam a despesa, centavo a centavo", () => {
    const amounts = loanAmounts([{ share: 1 / 3 }, { share: 1 / 3 }, { share: 1 / 3 }], 100);
    expect(amounts).toEqual([33.33, 33.33, 33.34]);
  });

  it("a mesma pessoa duas vezes não passa", () => {
    expect(() =>
      parseLoanFields(form({ lent: "1", "lent.0.personName": "Ana", "lent.1.personName": "ana" })),
    ).toThrow("duas vezes");
  });

  it("sem ninguém, pede para quem foi", () => {
    expect(() => parseLoanFields(form({ lent: "1" }))).toThrow();
  });
});
