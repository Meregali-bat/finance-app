import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A action de cadastro com o banco, o Auth.js e o Next de mentira: aqui só
 * importa a ordem (limite antes do banco) e o que volta para a tela.
 */
const mocks = vi.hoisted(() => ({
  reserve: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  signIn: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": "5.5.5.5" }) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findFirst: mocks.findFirst, create: mocks.create } },
}));
vi.mock("@/lib/auth-rate-limit-store", () => ({
  prismaAttemptStore: { reserve: mocks.reserve, release: vi.fn(), clear: vi.fn() },
}));
vi.mock("@/auth", async () => {
  const { CredentialsSignin } = await import("@auth/core/errors");
  class TooManyAttempts extends CredentialsSignin {
    code = "limite";
    constructor(readonly minutes: number) {
      super("limite");
    }
  }
  return { signIn: mocks.signIn, TooManyAttempts };
});

const { signUp } = await import("@/lib/actions/signup");
const { TooManyAttempts } = await import("@/auth");

function form(email: string, password = "senhaboa123", accept: string | null = "on") {
  const data = new FormData();
  data.set("email", email);
  data.set("password", password);
  if (accept !== null) data.set("accept", accept);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.reserve.mockResolvedValue({ ids: ["1", "2"] });
  mocks.findFirst.mockResolvedValue(null);
  mocks.create.mockResolvedValue({ id: "u1" });
  mocks.signIn.mockResolvedValue(undefined);
});

describe("signUp com limite", () => {
  it("conta a tentativa pelo e-mail normalizado e pelo IP", async () => {
    await signUp(null, form(" Ana@X.com "));
    const rules = mocks.reserve.mock.calls[0][0] as { key: string }[];
    expect(rules.map((r) => r.key)).toEqual(["signup:email:ana@x.com", "signup:ip:5.5.5.5"]);
  });

  it("estourado, recusa antes de olhar o banco e diz quanto falta", async () => {
    mocks.reserve.mockResolvedValue({ refused: { ok: false, retryAt: new Date(Date.now() + 30 * 60 * 1000) } });
    const state = await signUp(null, form("ana@x.com"));
    expect(state).toMatchObject({ field: "email", error: "Muitas tentativas. Tente de novo em 30 minutos." });
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("formulário inválido não gasta tentativa", async () => {
    await signUp(null, form("nao-e-email"));
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it("conta criada mas login travado por IP: vai para o login com o aviso", async () => {
    mocks.signIn.mockRejectedValue(new TooManyAttempts(7));
    await expect(signUp(null, form("ana@x.com"))).rejects.toThrow("REDIRECT /login?error=limite&min=7");
    expect(mocks.create).toHaveBeenCalledOnce();
  });

  it("o redirect do signIn passa direto", async () => {
    mocks.signIn.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(signUp(null, form("ana@x.com"))).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

describe("signUp com aceite dos termos", () => {
  it("sem marcar o aceite, recusa no campo do aceite e não gasta tentativa", async () => {
    const state = await signUp(null, form("ana@x.com", "senhaboa123", null));
    expect(state).toMatchObject({ field: "accept", email: "ana@x.com" });
    expect(state?.error).toContain("aceite os termos");
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("valor diferente de 'on' também não vale", async () => {
    const state = await signUp(null, form("ana@x.com", "senhaboa123", "true"));
    expect(state).toMatchObject({ field: "accept" });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("grava quando e qual versão foi aceita junto com a conta", async () => {
    const { LEGAL_VERSION } = await import("@/lib/legal");
    await signUp(null, form("ana@x.com"));
    const data = mocks.create.mock.calls[0][0].data;
    expect(data.consents).toEqual({ create: { kind: "terms", version: LEGAL_VERSION } });
  });
});
