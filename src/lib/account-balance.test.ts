import { describe, expect, it } from "vitest";
import { calculateAccountBalance } from "./account-balance";
import type { AccountMovementInput } from "./account-balance";

// O ajuste foi feito no dia 10/set às 9h; "agora" são 20h do mesmo dia.
const adjustedAt = new Date(2026, 8, 10, 9, 0);
const now = new Date(2026, 8, 10, 20, 0);
const adjustment = { balance: 1000, createdAt: adjustedAt };

/** Um movimento registrado depois do ajuste e ocorrido hoje, salvo indicação. */
function movement(overrides: Partial<AccountMovementInput> = {}): AccountMovementInput {
  return {
    amount: 100,
    registeredAt: new Date(2026, 8, 10, 10, 0),
    occurredOn: new Date(2026, 8, 10),
    ...overrides,
  };
}

describe("calculateAccountBalance", () => {
  it("não inventa saldo antes do primeiro ajuste", () => {
    const balance = calculateAccountBalance({
      credits: [movement()],
      debits: [],
      today: now,
    });
    expect(balance).toBeNull();
  });

  it("soma o recebimento e subtrai o gasto registrados depois do ajuste", () => {
    const balance = calculateAccountBalance({
      adjustment,
      credits: [movement({ amount: 500 })],
      debits: [movement({ amount: 80 })],
      today: now,
    });
    expect(balance).toBe(1420);
  });

  it("ignora o que já estava lançado quando o extrato foi lido", () => {
    const balance = calculateAccountBalance({
      adjustment,
      credits: [],
      debits: [movement({ registeredAt: new Date(2026, 8, 10, 8, 0) })],
      today: now,
    });
    expect(balance).toBe(1000);
  });

  it("ignora lançamento antigo sem data de registro", () => {
    const balance = calculateAccountBalance({
      adjustment,
      credits: [],
      debits: [movement({ registeredAt: null })],
      today: now,
    });
    expect(balance).toBe(1000);
  });

  it("não deixa o lançamento de amanhã derrubar o saldo de agora", () => {
    const balance = calculateAccountBalance({
      adjustment,
      credits: [],
      debits: [movement({ occurredOn: new Date(2026, 8, 11) })],
      today: now,
    });
    expect(balance).toBe(1000);
  });

  it("conta o lançamento esquecido: registrado hoje, datado ontem", () => {
    const balance = calculateAccountBalance({
      adjustment,
      credits: [],
      debits: [movement({ amount: 30, occurredOn: new Date(2026, 8, 9) })],
      today: now,
    });
    expect(balance).toBe(970);
  });

  it("soma a entrada avulsa, que chega como valor negativo", () => {
    const balance = calculateAccountBalance({
      adjustment,
      credits: [],
      debits: [movement({ amount: -200 })],
      today: now,
    });
    expect(balance).toBe(1200);
  });

  it("conta o pagamento confirmado à noite como movimento de hoje", () => {
    const balance = calculateAccountBalance({
      adjustment,
      credits: [],
      // `paidAt` é um instante real, não um dia de calendário: às 22h ele é
      // maior que a meia-noite de hoje e cairia fora de uma comparação crua.
      debits: [movement({ amount: 50, occurredOn: new Date(2026, 8, 10, 22, 30) })],
      today: now,
    });
    expect(balance).toBe(950);
  });

  it("recomeça do ajuste mais recente, descartando o que veio antes dele", () => {
    const balance = calculateAccountBalance({
      adjustment: { balance: 300, createdAt: new Date(2026, 8, 10, 18, 0) },
      credits: [],
      // Registrado às 10h: já estava no extrato lido às 18h.
      debits: [movement({ amount: 75 })],
      today: now,
    });
    expect(balance).toBe(300);
  });
});
