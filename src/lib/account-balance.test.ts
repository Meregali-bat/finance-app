import { describe, expect, it } from "vitest";
import { calculateAccountBalance, calculateRegisteredMovement } from "./account-balance";
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
      // Ajuste da véspera: o recebimento de hoje não podia estar nele.
      adjustment: { balance: 1000, createdAt: new Date(2026, 8, 9, 9, 0) },
      credits: [movement({ amount: 500 })],
      debits: [movement({ amount: 80 })],
      today: now,
    });
    expect(balance).toBe(1420);
  });

  it("não soma de novo o salário que já estava no banco quando o saldo foi informado", () => {
    // O salário caiu dia 5, o saldo foi corrigido dia 6 já com ele, e o
    // lembrete só foi confirmado dia 7.
    const balance = calculateAccountBalance({
      adjustment: { balance: 5500, createdAt: new Date(2026, 8, 6, 12, 0) },
      credits: [
        movement({
          amount: 5000,
          registeredAt: new Date(2026, 8, 7, 9, 0),
          occurredOn: new Date(2026, 8, 5),
        }),
      ],
      debits: [],
      today: now,
    });
    expect(balance).toBe(5500);
  });

  it("trata o recebimento do próprio dia do ajuste como já incluído", () => {
    const balance = calculateAccountBalance({
      adjustment,
      credits: [movement({ amount: 500 })],
      debits: [],
      today: now,
    });
    expect(balance).toBe(1000);
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

  it("não desconta de novo o gasto de antes do ajuste lançado depois dele", () => {
    // O gasto de ontem já tinha saído do banco quando o saldo foi lido hoje às
    // 9h; lançá-lo às 10h não pode tirá-lo uma segunda vez.
    const balance = calculateAccountBalance({
      adjustment,
      credits: [],
      debits: [movement({ amount: 30, occurredOn: new Date(2026, 8, 9) })],
      today: now,
    });
    expect(balance).toBe(1000);
  });

  it("desconta o gasto do próprio dia do ajuste lançado depois dele", () => {
    // Sem hora no lançamento, o dia do ajuste fica do lado seguro: um gasto
    // desconta.
    const balance = calculateAccountBalance({
      adjustment,
      credits: [],
      debits: [movement({ amount: 30 })],
      today: now,
    });
    expect(balance).toBe(970);
  });

  it("não desconta de novo a fatura paga antes do ajuste e marcada depois", () => {
    const balance = calculateAccountBalance({
      adjustment,
      credits: [],
      debits: [
        movement({
          amount: 800,
          registeredAt: new Date(2026, 8, 10, 11, 0),
          occurredOn: new Date(2026, 8, 8),
        }),
      ],
      today: now,
    });
    expect(balance).toBe(1000);
  });

  it("soma a entrada avulsa, que chega como valor negativo", () => {
    const balance = calculateAccountBalance({
      // Ajuste da véspera: a entrada de hoje não podia estar nele.
      adjustment: { balance: 1000, createdAt: new Date(2026, 8, 9, 9, 0) },
      credits: [],
      debits: [movement({ amount: -200 })],
      today: now,
    });
    expect(balance).toBe(1200);
  });

  it("trata a entrada avulsa do próprio dia do ajuste como já incluída", () => {
    const balance = calculateAccountBalance({
      adjustment,
      credits: [],
      debits: [movement({ amount: -200 })],
      today: now,
    });
    expect(balance).toBe(1000);
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

describe("calculateRegisteredMovement", () => {
  it("soma o que entrou e subtrai o que saiu até hoje", () => {
    const movement = calculateRegisteredMovement({
      credits: [{ amount: 3000, occurredOn: new Date(2026, 8, 5) }],
      debits: [{ amount: 200, occurredOn: new Date(2026, 8, 6) }],
      today: now,
    });
    expect(movement).toBe(2800);
  });

  it("conta o lançamento sem data de registro, ao contrário do saldo", () => {
    // A diferença que justifica a função existir: aqui não há marco de ajuste,
    // então uma linha antiga sem `createdAt` ainda é dinheiro que se moveu.
    const movement = calculateRegisteredMovement({
      credits: [],
      debits: [{ amount: 50, registeredAt: null, occurredOn: new Date(2026, 8, 1) }],
      today: now,
    });
    expect(movement).toBe(-50);
  });

  it("não conta o que ainda vai acontecer", () => {
    const movement = calculateRegisteredMovement({
      credits: [],
      debits: [{ amount: 50, occurredOn: new Date(2026, 8, 11) }],
      today: now,
    });
    expect(movement).toBe(0);
  });

  it("soma a entrada avulsa, que chega como valor negativo", () => {
    const movement = calculateRegisteredMovement({
      credits: [],
      debits: [{ amount: -400, occurredOn: new Date(2026, 8, 9) }],
      today: now,
    });
    expect(movement).toBe(400);
  });
});
