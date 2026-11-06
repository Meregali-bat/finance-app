import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Contra um Postgres de verdade, com as migrations aplicadas. Não roda na
 * suíte normal: só com DB_INTEGRATION=1 e DATABASE_URL apontando para um banco
 * descartável (os dados criados aqui são apagados no fim).
 *
 *   DB_INTEGRATION=1 DATABASE_URL=postgresql://… npx prisma migrate deploy
 *   DB_INTEGRATION=1 DATABASE_URL=postgresql://… npx vitest run src/lib/db.integration.test.ts
 */
const enabled = process.env.DB_INTEGRATION === "1";

const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/auth-helpers", () => ({ requireUserId: async () => session.userId }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

describe.skipIf(!enabled)("banco de verdade", async () => {
  const { prisma } = await import("@/lib/prisma");
  const { prismaAiUsageStore } = await import("@/lib/ai-quota-store");
  const { withAiQuota } = await import("@/lib/ai-quota");
  const { createCardPurchase } = await import("@/lib/actions/card");
  const { createTransaction } = await import("@/lib/actions/transaction");

  const tag = `it-${Date.now()}`;
  let ana: string;
  let bia: string;
  let anaCard: string;
  let biaCard: string;
  let biaCategory: string;

  beforeAll(async () => {
    ana = (await prisma.user.create({ data: { email: `ana-${tag}@x.test`, passwordHash: "x" } })).id;
    bia = (await prisma.user.create({ data: { email: `bia-${tag}@x.test`, passwordHash: "x" } })).id;
    anaCard = (await prisma.creditCard.create({ data: { userId: ana, name: "A", closingDay: 1, dueDay: 8 } })).id;
    biaCard = (await prisma.creditCard.create({ data: { userId: bia, name: "B", closingDay: 1, dueDay: 8 } })).id;
    biaCategory = (await prisma.category.create({ data: { userId: bia, name: "Mercado" } })).id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [ana, bia] } } });
    await prisma.$disconnect();
  });

  function form(fields: Record<string, string>) {
    const data = new FormData();
    for (const [k, v] of Object.entries(fields)) data.set(k, v);
    return data;
  }
  const purchase = { description: "Mercado", amount: "50", date: "2026-11-06" };

  it("não grava compra no cartão de outra conta", async () => {
    session.userId = ana;
    await expect(createCardPurchase(biaCard, form(purchase))).rejects.toThrow("Cartão não encontrado.");
    expect(await prisma.cardPurchase.count({ where: { cardId: biaCard } })).toBe(0);
  });

  it("não grava categoria de outra conta", async () => {
    session.userId = ana;
    await expect(createCardPurchase(anaCard, form({ ...purchase, categoryId: biaCategory }))).rejects.toThrow(
      "Categoria não encontrada.",
    );
    await expect(
      createTransaction(form({ description: "Padaria", amount: "10", categoryId: biaCategory })),
    ).rejects.toThrow("Categoria não encontrada.");
    expect(await prisma.cardPurchase.count({ where: { userId: ana } })).toBe(0);
    expect(await prisma.transaction.count({ where: { userId: ana } })).toBe(0);
  });

  it("grava no próprio cartão", async () => {
    session.userId = ana;
    await createCardPurchase(anaCard, form(purchase));
    expect(await prisma.cardPurchase.count({ where: { cardId: anaCard, userId: ana } })).toBe(1);
  });

  it("a cota segura chamadas simultâneas", async () => {
    const limits = { daily: 3, monthly: 100 };
    const call = () => new Promise((r) => setTimeout(() => r("ok"), 20));
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => withAiQuota(prismaAiUsageStore, bia, "spending", call, { limits })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(await prisma.aiUsage.count({ where: { userId: bia } })).toBe(3);
  });

  it("devolve a reserva quando a API falha antes de responder", async () => {
    const { APIConnectionError } = await import("@anthropic-ai/sdk");
    const before = await prisma.aiUsage.count({ where: { userId: ana } });
    await expect(
      withAiQuota(prismaAiUsageStore, ana, "bill", async () => {
        throw new APIConnectionError({ message: "sem rede" });
      }),
    ).rejects.toBeInstanceOf(APIConnectionError);
    expect(await prisma.aiUsage.count({ where: { userId: ana } })).toBe(before);
  });
});
