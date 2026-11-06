import { describe, expect, it } from "vitest";
import { APIConnectionError, InternalServerError } from "@anthropic-ai/sdk";
import { Refusal } from "@/lib/action-result";
import {
  DEFAULT_AI_LIMITS,
  aiCallWasNotBilled,
  aiLimitsFrom,
  aiQuotaDecision,
  aiQuotaMessage,
  withAiQuota,
  type AiQuotaDecision,
  type AiUsageStore,
} from "@/lib/ai-quota";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const now = new Date("2026-11-06T15:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("aiLimitsFrom", () => {
  it("usa o padrão sem variável", () => {
    expect(aiLimitsFrom({})).toEqual(DEFAULT_AI_LIMITS);
  });

  it("lê os limites do ambiente", () => {
    expect(aiLimitsFrom({ AI_DAILY_LIMIT: "3", AI_MONTHLY_LIMIT: " 40 " })).toEqual({
      daily: 3,
      monthly: 40,
    });
  });

  it("aceita 0, que desliga", () => {
    expect(aiLimitsFrom({ AI_DAILY_LIMIT: "0" }).daily).toBe(0);
  });

  it("ignora valor inválido em vez de liberar sem limite", () => {
    expect(aiLimitsFrom({ AI_DAILY_LIMIT: "-1", AI_MONTHLY_LIMIT: "muito" })).toEqual(DEFAULT_AI_LIMITS);
    expect(aiLimitsFrom({ AI_DAILY_LIMIT: "2.5" }).daily).toBe(DEFAULT_AI_LIMITS.daily);
  });
});

describe("aiQuotaDecision", () => {
  const limits = { daily: 3, monthly: 5 };

  it("deixa enquanto há cota", () => {
    expect(aiQuotaDecision([ago(HOUR), ago(2 * HOUR)], limits, now)).toEqual({ ok: true });
  });

  it("barra na terceira do dia e libera quando a mais antiga sai das 24 horas", () => {
    const decision = aiQuotaDecision([ago(1 * HOUR), ago(5 * HOUR), ago(10 * HOUR)], limits, now);
    expect(decision).toEqual({
      ok: false,
      reason: "daily",
      limit: 3,
      retryAt: new Date(ago(10 * HOUR).getTime() + DAY),
    });
  });

  it("chamadas de mais de 24 horas não contam no dia", () => {
    expect(aiQuotaDecision([ago(1 * HOUR), ago(25 * HOUR), ago(30 * HOUR)], limits, now)).toEqual({
      ok: true,
    });
  });

  it("barra no mês mesmo com o dia livre", () => {
    const recent = [ago(2 * DAY), ago(5 * DAY), ago(9 * DAY), ago(20 * DAY), ago(29 * DAY)];
    const decision = aiQuotaDecision(recent, limits, now);
    expect(decision).toMatchObject({ ok: false, reason: "monthly", limit: 5 });
    expect((decision as { retryAt: Date }).retryAt).toEqual(new Date(ago(29 * DAY).getTime() + 30 * DAY));
  });

  it("com as duas estouradas, vale a que libera mais tarde", () => {
    const recent = [ago(1 * HOUR), ago(2 * HOUR), ago(3 * HOUR), ago(10 * DAY), ago(12 * DAY)];
    const decision = aiQuotaDecision(recent, limits, now);
    expect(decision).toMatchObject({ reason: "monthly" });
  });

  it("não depende da ordem das datas", () => {
    const a = aiQuotaDecision([ago(10 * HOUR), ago(1 * HOUR), ago(5 * HOUR)], limits, now);
    const b = aiQuotaDecision([ago(1 * HOUR), ago(5 * HOUR), ago(10 * HOUR)], limits, now);
    expect(a).toEqual(b);
  });

  it("limite 0 desliga", () => {
    expect(aiQuotaDecision([], { daily: 0, monthly: 5 }, now)).toEqual({ ok: false, reason: "disabled" });
  });
});

describe("aiQuotaMessage", () => {
  it("diz o limite e quando libera, no horário de Brasília", () => {
    const text = aiQuotaMessage({
      ok: false,
      reason: "daily",
      limit: 10,
      retryAt: new Date("2026-11-07T13:30:00Z"),
    });
    expect(text).toBe(
      "Você já usou 10 análises com IA nas últimas 24 horas, o limite. Libera de novo em 07/11 às 10:30.",
    );
  });

  it("explica quando a IA está desligada", () => {
    expect(aiQuotaMessage({ ok: false, reason: "disabled" })).toMatch(/desligadas/);
  });
});

describe("aiCallWasNotBilled", () => {
  it("erro da API não conta", () => {
    expect(aiCallWasNotBilled(new APIConnectionError({ message: "sem rede" }))).toBe(true);
    expect(aiCallWasNotBilled(new InternalServerError(500, undefined, "fora", new Headers()))).toBe(true);
  });

  it("recusa ou erro depois da resposta conta", () => {
    expect(aiCallWasNotBilled(new Refusal("A IA não conseguiu"))).toBe(false);
    expect(aiCallWasNotBilled(new Error("x"))).toBe(false);
  });
});

/** Um banco falso que guarda as chamadas na memória. */
function memoryStore() {
  const rows: { id: string; userId: string; createdAt: Date }[] = [];
  let next = 0;
  const store: AiUsageStore = {
    async reserve(userId, _feature, since, decide) {
      const recent = rows.filter((r) => r.userId === userId && r.createdAt > since).map((r) => r.createdAt);
      const decision: AiQuotaDecision = decide(recent);
      if (!decision.ok) return { refused: decision };
      const id = `u${next++}`;
      rows.push({ id, userId, createdAt: now });
      return { id };
    },
    async release(id) {
      rows.splice(rows.findIndex((r) => r.id === id), 1);
    },
  };
  return { store, rows };
}

describe("withAiQuota", () => {
  const limits = { daily: 2, monthly: 10 };
  const ok = async () => "resposta";

  it("conta cada chamada e barra quem passou do limite sem chamar a IA", async () => {
    const { store, rows } = memoryStore();
    await withAiQuota(store, "ana", "spending", ok, { limits, now });
    await withAiQuota(store, "ana", "bill", ok, { limits, now });
    let called = false;
    await expect(
      withAiQuota(store, "ana", "statement", async () => ((called = true), "x"), { limits, now }),
    ).rejects.toBeInstanceOf(Refusal);
    expect(called).toBe(false);
    expect(rows).toHaveLength(2);
  });

  it("a cota é de cada pessoa", async () => {
    const { store } = memoryStore();
    await withAiQuota(store, "ana", "spending", ok, { limits, now });
    await withAiQuota(store, "ana", "spending", ok, { limits, now });
    await expect(withAiQuota(store, "bia", "spending", ok, { limits, now })).resolves.toBe("resposta");
  });

  it("devolve a chamada à cota quando a API nem respondeu", async () => {
    const { store, rows } = memoryStore();
    const down = async () => {
      throw new APIConnectionError({ message: "sem rede" });
    };
    await expect(withAiQuota(store, "ana", "bill", down, { limits, now })).rejects.toBeInstanceOf(
      APIConnectionError,
    );
    expect(rows).toHaveLength(0);
  });

  it("mantém a chamada na cota quando a resposta veio e foi recusada", async () => {
    const { store, rows } = memoryStore();
    const refused = async () => {
      throw new Refusal("A IA não conseguiu analisar agora.");
    };
    await expect(withAiQuota(store, "ana", "bill", refused, { limits, now })).rejects.toBeInstanceOf(Refusal);
    expect(rows).toHaveLength(1);
  });
});
