import { describe, expect, it } from "vitest";
import { loanAmount, parseLoanFields } from "./loan-sync";

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
}

describe("quanto a pessoa deve", () => {
  it("metade do almoço dividido", () => {
    const fields = parseLoanFields(
      form({ lent: "1", lentPersonName: "Ana", lentShare: String(1 / 2) }),
    )!;
    expect(loanAmount(fields, 87.3)).toBe(43.65);
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
      parseLoanFields(form({ lent: "1", lentPersonName: "Ana", lentShare: "1.5" })),
    ).toThrow();
  });
});
