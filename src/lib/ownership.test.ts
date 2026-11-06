import { describe, expect, it } from "vitest";
import { Refusal } from "@/lib/action-result";
import { ownCard, ownCardIdOrNull, ownCategoryIdOrNull, type OwnershipClient } from "@/lib/ownership";

/** Um banco falso com dois donos: "ana" e "bia". */
function fakeDb(): OwnershipClient & { calls: unknown[] } {
  const cards = [
    { id: "card-ana", userId: "ana", closingDay: 3, deletedAt: null as Date | null },
    { id: "card-bia", userId: "bia", closingDay: 10, deletedAt: null as Date | null },
    { id: "card-ana-apagado", userId: "ana", closingDay: 5, deletedAt: new Date() },
  ];
  const categories = [
    { id: "cat-ana", userId: "ana" },
    { id: "cat-bia", userId: "bia" },
  ];
  const calls: unknown[] = [];
  return {
    calls,
    creditCard: {
      async findFirst({ where }) {
        calls.push(where);
        const card = cards.find(
          (c) => c.id === where.id && c.userId === where.userId && c.deletedAt === where.deletedAt,
        );
        return card ? { id: card.id, closingDay: card.closingDay } : null;
      },
    },
    category: {
      async findFirst({ where }) {
        calls.push(where);
        const category = categories.find((c) => c.id === where.id && c.userId === where.userId);
        return category ? { id: category.id } : null;
      },
    },
  };
}

describe("ownCard", () => {
  it("devolve o cartão da própria pessoa", async () => {
    expect(await ownCard(fakeDb(), "ana", "card-ana")).toEqual({ id: "card-ana", closingDay: 3 });
  });

  it("recusa o cartão de outra pessoa", async () => {
    await expect(ownCard(fakeDb(), "ana", "card-bia")).rejects.toBeInstanceOf(Refusal);
  });

  it("recusa um cartão apagado", async () => {
    await expect(ownCard(fakeDb(), "ana", "card-ana-apagado")).rejects.toThrow("Cartão não encontrado.");
  });

  it("recusa id vazio sem ir ao banco", async () => {
    const db = fakeDb();
    await expect(ownCard(db, "ana", "")).rejects.toBeInstanceOf(Refusal);
    expect(db.calls).toHaveLength(0);
  });

  it("filtra pelo dono na consulta", async () => {
    const db = fakeDb();
    await ownCard(db, "ana", "card-ana");
    expect(db.calls[0]).toMatchObject({ id: "card-ana", userId: "ana" });
  });
});

describe("ownCardIdOrNull", () => {
  it("vazio é sem cartão", async () => {
    expect(await ownCardIdOrNull(fakeDb(), "ana", "")).toBeNull();
    expect(await ownCardIdOrNull(fakeDb(), "ana", null)).toBeNull();
    expect(await ownCardIdOrNull(fakeDb(), "ana", undefined)).toBeNull();
  });

  it("recusa o cartão alheio em vez de gravar sem cartão", async () => {
    await expect(ownCardIdOrNull(fakeDb(), "bia", "card-ana")).rejects.toBeInstanceOf(Refusal);
  });
});

describe("ownCategoryIdOrNull", () => {
  it("vazio é sem categoria", async () => {
    expect(await ownCategoryIdOrNull(fakeDb(), "ana", "")).toBeNull();
    expect(await ownCategoryIdOrNull(fakeDb(), "ana", null)).toBeNull();
  });

  it("devolve a categoria da própria pessoa", async () => {
    expect(await ownCategoryIdOrNull(fakeDb(), "bia", "cat-bia")).toBe("cat-bia");
  });

  it("recusa a categoria de outra pessoa", async () => {
    await expect(ownCategoryIdOrNull(fakeDb(), "ana", "cat-bia")).rejects.toThrow(
      "Categoria não encontrada.",
    );
  });
});
