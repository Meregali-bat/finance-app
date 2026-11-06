import { beforeEach, describe, expect, it, vi } from "vitest";
import { AI_CONSENT_REQUIRED, AI_CONSENT_VERSION, LEGAL_VERSION } from "@/lib/legal";

/**
 * O consentimento com o banco de mentira: o que importa é que a IA não é
 * chamada (nem gasta cota) sem ele, e que o aceite grava a versão atual.
 */
const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
  reserve: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth-helpers", () => ({ requireUserId: async () => "u1" }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    consent: { findMany: mocks.findMany, create: mocks.create, updateMany: mocks.updateMany },
    $transaction: mocks.reserve,
  },
}));

const { withUserAiQuota } = await import("@/lib/ai-quota-store");
const { acceptTerms, grantAiConsent, revokeAiConsent } = await import("@/lib/actions/consent");

const form = (accept?: string) => {
  const data = new FormData();
  if (accept !== undefined) data.set("accept", accept);
  return data;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMany.mockResolvedValue([]);
});

describe("IA sem consentimento", () => {
  it("recusa antes da cota e não chama a IA", async () => {
    const call = vi.fn();
    await expect(withUserAiQuota("u1", "spending", call)).rejects.toThrow(AI_CONSENT_REQUIRED);
    expect(call).not.toHaveBeenCalled();
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it("revogado também recusa", async () => {
    mocks.findMany.mockResolvedValue([
      { kind: "ai", version: AI_CONSENT_VERSION, createdAt: new Date(), revokedAt: new Date() },
    ]);
    const call = vi.fn();
    await expect(withUserAiQuota("u1", "bill", call)).rejects.toThrow(AI_CONSENT_REQUIRED);
    expect(call).not.toHaveBeenCalled();
  });

  it("com consentimento, segue para a cota", async () => {
    mocks.findMany.mockResolvedValue([
      { kind: "ai", version: AI_CONSENT_VERSION, createdAt: new Date(), revokedAt: null },
    ]);
    mocks.reserve.mockResolvedValue({ id: "use1" });
    const call = vi.fn().mockResolvedValue("ok");
    await expect(withUserAiQuota("u1", "bill", call)).resolves.toBe("ok");
    expect(mocks.reserve).toHaveBeenCalledOnce();
  });
});

describe("actions de aceite", () => {
  it("/aceite sem marcar a caixa não grava", async () => {
    const state = await acceptTerms(null, form());
    expect(state?.error).toContain("Marque");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("/aceite marcado grava a versão atual e vai para o início", async () => {
    await expect(acceptTerms(null, form("on"))).rejects.toThrow("REDIRECT /");
    expect(mocks.create).toHaveBeenCalledWith({ data: { userId: "u1", kind: "terms", version: LEGAL_VERSION } });
  });

  it("autorizar a IA grava a versão atual", async () => {
    await grantAiConsent();
    expect(mocks.create).toHaveBeenCalledWith({ data: { userId: "u1", kind: "ai", version: AI_CONSENT_VERSION } });
  });

  it("revogar marca só o que está valendo, sem apagar o histórico", async () => {
    await revokeAiConsent();
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", kind: "ai", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
