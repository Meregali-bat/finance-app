import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O furo de isolamento: uma action que grava o id de cartão ou de categoria
 * que veio do navegador sem ver de quem é. Aqui a pessoa logada é "ana", e o
 * banco só tem cartão e categoria de "bia".
 */
const db = vi.hoisted(() => {
  const writes: string[] = [];
  const tx = {
    cardPurchase: {
      create: vi.fn(async () => (writes.push("cardPurchase.create"), { id: "p1" })),
      update: vi.fn(async () => (writes.push("cardPurchase.update"), { id: "p1" })),
    },
    transaction: {
      create: vi.fn(async () => (writes.push("transaction.create"), { id: "t1" })),
      update: vi.fn(async () => (writes.push("transaction.update"), { id: "t1" })),
    },
    loan: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  };
  return {
    writes,
    prisma: {
      ...tx,
      // Só o que é de "bia" existe.
      creditCard: {
        findFirst: vi.fn(async ({ where }: { where: { id: string; userId: string } }) =>
          where.id === "card-bia" && where.userId === "bia" ? { id: "card-bia", closingDay: 3 } : null,
        ),
      },
      category: {
        findFirst: vi.fn(async ({ where }: { where: { id: string; userId: string } }) =>
          where.id === "cat-bia" && where.userId === "bia" ? { id: "cat-bia" } : null,
        ),
      },
      fixedExpense: {
        create: vi.fn(async () => (writes.push("fixedExpense.create"), { id: "f1" })),
        update: vi.fn(async () => (writes.push("fixedExpense.update"), { id: "f1" })),
      },
      expensePayment: { findMany: vi.fn(async () => []) },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: db.prisma }));
vi.mock("@/lib/auth-helpers", () => ({ requireUserId: async () => "ana" }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createCardPurchase, updateCardPurchase } from "@/lib/actions/card";
import { createTransaction, updateTransaction } from "@/lib/actions/transaction";
import { createFixedExpense, updateFixedExpense } from "@/lib/actions/expense";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

const purchase = { description: "Mercado", amount: "50", date: "2026-11-06", installments: "1" };

beforeEach(() => {
  db.writes.length = 0;
});

describe("ninguém grava no cartão ou na categoria de outra conta", () => {
  it("compra no cartão de outra pessoa", async () => {
    await expect(createCardPurchase("card-bia", form(purchase))).rejects.toThrow("Cartão não encontrado.");
    expect(db.writes).toEqual([]);
  });

  it("compra com categoria de outra pessoa", async () => {
    db.prisma.creditCard.findFirst.mockResolvedValueOnce({ id: "card-ana", closingDay: 3 });
    await expect(
      createCardPurchase("card-ana", form({ ...purchase, categoryId: "cat-bia" })),
    ).rejects.toThrow("Categoria não encontrada.");
    expect(db.writes).toEqual([]);
  });

  it("editar compra pondo categoria de outra pessoa", async () => {
    await expect(
      updateCardPurchase("p1", "card-ana", form({ ...purchase, categoryId: "cat-bia" })),
    ).rejects.toThrow("Categoria não encontrada.");
    expect(db.writes).toEqual([]);
  });

  it("lançamento com categoria de outra pessoa", async () => {
    const fields = { description: "Padaria", amount: "10", categoryId: "cat-bia" };
    await expect(createTransaction(form(fields))).rejects.toThrow("Categoria não encontrada.");
    await expect(updateTransaction("t1", form(fields))).rejects.toThrow("Categoria não encontrada.");
    expect(db.writes).toEqual([]);
  });

  it("transferência ignora a categoria mandada, sem consultar", async () => {
    await createTransaction(
      form({ description: "Para a poupança", amount: "10", categoryId: "cat-bia", transfer: "1" }),
    );
    expect(db.writes).toEqual(["transaction.create"]);
  });

  it("despesa fixa no cartão ou com categoria de outra pessoa", async () => {
    const onCard = { label: "Streaming", amount: "30", cardId: "card-bia" };
    expect(await createFixedExpense(form(onCard))).toEqual({ error: "Cartão não encontrado." });
    expect(await updateFixedExpense("f1", form(onCard))).toEqual({ error: "Cartão não encontrado." });
    const withCategory = { label: "Aluguel", amount: "900", dueDay: "5", categoryId: "cat-bia" };
    expect(await createFixedExpense(form(withCategory))).toEqual({ error: "Categoria não encontrada." });
    expect(db.writes).toEqual([]);
  });

  it("o próprio cartão, e sem categoria, continua gravando", async () => {
    db.prisma.creditCard.findFirst.mockResolvedValueOnce({ id: "card-ana", closingDay: 3 });
    await createCardPurchase("card-ana", form(purchase));
    await createFixedExpense(form({ label: "Aluguel", amount: "900", dueDay: "5" }));
    expect(db.writes).toEqual(["cardPurchase.create", "fixedExpense.create"]);
  });
});
