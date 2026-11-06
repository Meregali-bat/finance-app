import { describe, expect, it } from "vitest";
import {
  AUTH_LIMITS,
  clientIp,
  guardLogin,
  hashKey,
  loginRules,
  rateDecision,
  rateLimitMessage,
  reserveAttempt,
  retryMinutes,
  signupRules,
  type AttemptStore,
  type RateRule,
} from "@/lib/auth-rate-limit";

const MINUTE = 60 * 1000;
const now = new Date("2026-11-06T15:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

/** Um banco de mentira: guarda as tentativas por chave, como a tabela. */
function fakeStore() {
  let next = 0;
  const rows: { id: string; key: string; at: Date }[] = [];
  const store: AttemptStore = {
    async reserve(rules, at, decide) {
      const recent = rules.map((r) =>
        rows.filter((row) => row.key === r.key && row.at.getTime() > at.getTime() - r.windowMs).map((row) => row.at),
      );
      const decision = decide(recent);
      if (!decision.ok) return { refused: decision };
      const ids = rules.map((r) => {
        const id = String(next++);
        rows.push({ id, key: r.key, at });
        return id;
      });
      return { ids };
    },
    async release(ids) {
      for (const id of ids) {
        const i = rows.findIndex((r) => r.id === id);
        if (i >= 0) rows.splice(i, 1);
      }
    },
    async clear(key) {
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i].key === key) rows.splice(i, 1);
    },
  };
  return { store, rows };
}

describe("clientIp", () => {
  it("prefere o x-real-ip", () => {
    expect(clientIp(new Headers({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }))).toBe("1.1.1.1");
  });

  it("senão, o primeiro do x-forwarded-for", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": " 2.2.2.2 , 10.0.0.1" }))).toBe("2.2.2.2");
  });

  it("sem cabeçalho, não inventa IP", () => {
    expect(clientIp(new Headers())).toBeNull();
  });
});

describe("regras", () => {
  it("o e-mail não muda de chave por maiúscula ou espaço", () => {
    expect(loginRules(" Ana@X.com ", null)[0].key).toBe(loginRules("ana@x.com", null)[0].key);
    expect(signupRules(" Ana@X.com ", null)[0].key).toBe(signupRules("ana@x.com", null)[0].key);
  });

  it("login e cadastro não dividem contagem", () => {
    expect(loginRules("a@x.com", "1.1.1.1").map((r) => r.key)).not.toContain(
      signupRules("a@x.com", "1.1.1.1")[0].key,
    );
  });

  it("sem IP, fica só a regra do e-mail", () => {
    expect(loginRules("a@x.com", null)).toHaveLength(1);
    expect(loginRules("a@x.com", "1.1.1.1")).toHaveLength(2);
  });

  it("o hash não guarda o e-mail legível", () => {
    const h = hashKey("login:email:ana@x.com");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("ana");
  });
});

describe("rateDecision", () => {
  const rule: RateRule = { key: "k", limit: 3, windowMs: 15 * MINUTE };

  it("deixa abaixo do limite", () => {
    expect(rateDecision([rule], [[ago(MINUTE), ago(2 * MINUTE)]], now)).toEqual({ ok: true });
  });

  it("recusa no limite e diz quando libera", () => {
    const decision = rateDecision([rule], [[ago(10 * MINUTE), ago(2 * MINUTE), ago(MINUTE)]], now);
    // Libera quando a mais antiga das três sai da janela: daqui a 5 minutos.
    expect(decision).toEqual({ ok: false, retryAt: new Date(now.getTime() + 5 * MINUTE) });
  });

  it("ignora o que já saiu da janela", () => {
    expect(rateDecision([rule], [[ago(20 * MINUTE), ago(2 * MINUTE), ago(MINUTE)]], now)).toEqual({ ok: true });
  });

  it("com duas regras estouradas, vale a que libera mais tarde", () => {
    const other: RateRule = { key: "o", limit: 1, windowMs: 60 * MINUTE };
    const decision = rateDecision(
      [rule, other],
      [[ago(10 * MINUTE), ago(2 * MINUTE), ago(MINUTE)], [ago(30 * MINUTE)]],
      now,
    );
    expect(decision).toEqual({ ok: false, retryAt: new Date(now.getTime() + 30 * MINUTE) });
  });
});

describe("mensagem", () => {
  it("arredonda para cima", () => {
    expect(retryMinutes(new Date(now.getTime() + 61 * 1000), now)).toBe(2);
    expect(retryMinutes(new Date(now.getTime() + 1000), now)).toBe(1);
  });

  it("singular e plural", () => {
    expect(rateLimitMessage(1)).toBe("Muitas tentativas. Tente de novo em 1 minuto.");
    expect(rateLimitMessage(12)).toBe("Muitas tentativas. Tente de novo em 12 minutos.");
  });

  it("número estranho vindo da URL vira texto vago", () => {
    for (const n of [null, NaN, 0, -3, 2.5, 99999]) {
      expect(rateLimitMessage(n)).toBe("Muitas tentativas. Espere alguns minutos e tente de novo.");
    }
  });
});

describe("guardLogin", () => {
  const user = { id: "u1" };
  const wrong = async () => null;
  const right = async () => user;

  it("trava a conta depois de 5 senhas erradas, mesmo vindo de IPs diferentes", async () => {
    const { store } = fakeStore();
    for (let i = 0; i < AUTH_LIMITS.loginEmail.limit; i++) {
      expect(await guardLogin(store, "ana@x.com", `1.1.1.${i}`, wrong, now)).toEqual({ limited: false, result: null });
    }
    let checked = false;
    const blocked = await guardLogin(store, "ana@x.com", "9.9.9.9", async () => ((checked = true), user), now);
    expect(blocked).toEqual({ limited: true, minutes: 15 });
    // Nem chega a checar a senha: a certa também é recusada enquanto trava.
    expect(checked).toBe(false);
  });

  it("libera quando a janela passa", async () => {
    const { store } = fakeStore();
    const t0 = ago(16 * MINUTE);
    for (let i = 0; i < AUTH_LIMITS.loginEmail.limit; i++) await guardLogin(store, "ana@x.com", null, wrong, t0);
    expect(await guardLogin(store, "ana@x.com", null, right, now)).toEqual({ limited: false, result: user });
  });

  it("trava o IP que testa muitas contas", async () => {
    const { store } = fakeStore();
    for (let i = 0; i < AUTH_LIMITS.loginIp.limit; i++) {
      await guardLogin(store, `conta${i}@x.com`, "6.6.6.6", wrong, now);
    }
    expect((await guardLogin(store, "nova@x.com", "6.6.6.6", right, now)).limited).toBe(true);
    // Outro IP, mesma conta nova: passa.
    expect(await guardLogin(store, "nova@x.com", "7.7.7.7", right, now)).toEqual({ limited: false, result: user });
  });

  it("login certo não conta e zera as senhas erradas da conta", async () => {
    const { store, rows } = fakeStore();
    for (let i = 0; i < AUTH_LIMITS.loginEmail.limit - 1; i++) await guardLogin(store, "ana@x.com", "1.1.1.1", wrong, now);
    await guardLogin(store, "ana@x.com", "1.1.1.1", right, now);
    expect(rows.filter((r) => r.key === "login:email:ana@x.com")).toHaveLength(0);
    // As do IP ficam: acertar a própria senha não limpa o que o IP errou em outras contas.
    expect(rows.filter((r) => r.key === "login:ip:1.1.1.1")).toHaveLength(AUTH_LIMITS.loginEmail.limit - 1);
    expect((await guardLogin(store, "ana@x.com", "1.1.1.1", wrong, now)).limited).toBe(false);
  });

  it("erro do banco na checagem não conta como senha errada", async () => {
    const { store, rows } = fakeStore();
    const boom = async () => {
      throw new Error("banco fora");
    };
    await expect(guardLogin(store, "ana@x.com", "1.1.1.1", boom, now)).rejects.toThrow("banco fora");
    expect(rows).toHaveLength(0);
  });
});

describe("cadastro", () => {
  it("trava o IP depois de 5 cadastros na hora", async () => {
    const { store } = fakeStore();
    for (let i = 0; i < AUTH_LIMITS.signupIp.limit; i++) {
      expect((await reserveAttempt(store, signupRules(`p${i}@x.com`, "5.5.5.5"), now)).ok).toBe(true);
    }
    expect(await reserveAttempt(store, signupRules("outra@x.com", "5.5.5.5"), now)).toEqual({ ok: false, minutes: 60 });
  });

  it("trava o mesmo e-mail depois de 3 tentativas, de qualquer IP", async () => {
    const { store } = fakeStore();
    for (let i = 0; i < AUTH_LIMITS.signupEmail.limit; i++) {
      await reserveAttempt(store, signupRules("ana@x.com", `1.1.1.${i}`), now);
    }
    expect((await reserveAttempt(store, signupRules("ANA@x.com", "8.8.8.8"), now)).ok).toBe(false);
  });

  it("recusa não conta: quem insiste não estica o próprio bloqueio", async () => {
    const { store, rows } = fakeStore();
    for (let i = 0; i < AUTH_LIMITS.signupEmail.limit; i++) await reserveAttempt(store, signupRules("ana@x.com", null), now);
    const before = rows.length;
    await reserveAttempt(store, signupRules("ana@x.com", null), now);
    expect(rows).toHaveLength(before);
  });
});
