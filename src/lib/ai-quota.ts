import { APIError } from "@anthropic-ai/sdk";
import { Refusal } from "@/lib/action-result";

/**
 * Cota de chamadas à IA por pessoa.
 *
 * Cada análise (metas, extrato, fatura, prints) é uma chamada ao Opus que pode
 * gerar até 16 mil tokens de saída. Sem teto, uma conta só — ou um script com
 * a sessão de alguém — gasta a chave da Anthropic sem limite.
 *
 * As quatro análises dividem a mesma cota, contada em janelas móveis: as
 * últimas 24 horas e os últimos 30 dias. Os limites vêm do ambiente, para
 * mudar sem deploy de código quando se decidir se o app é grátis ou pago:
 *
 * - `AI_DAILY_LIMIT`   chamadas por pessoa em 24 horas (padrão 10)
 * - `AI_MONTHLY_LIMIT` chamadas por pessoa em 30 dias (padrão 60)
 *
 * 0 desliga a IA para todo mundo. Valor vazio ou inválido vale o padrão.
 */
export const DEFAULT_AI_LIMITS = { daily: 10, monthly: 60 } as const;

export type AiLimits = { daily: number; monthly: number };

export type AiFeature = "spending" | "statement" | "bill" | "screenshots";

const DAY_MS = 24 * 60 * 60 * 1000;
export const AI_WINDOWS = { daily: DAY_MS, monthly: 30 * DAY_MS } as const;

function limitFrom(raw: string | undefined, fallback: number): number {
  const text = raw?.trim();
  if (!text || !/^\d+$/.test(text)) return fallback;
  return Number(text);
}

export function aiLimitsFrom(env: Record<string, string | undefined>): AiLimits {
  return {
    daily: limitFrom(env.AI_DAILY_LIMIT, DEFAULT_AI_LIMITS.daily),
    monthly: limitFrom(env.AI_MONTHLY_LIMIT, DEFAULT_AI_LIMITS.monthly),
  };
}

export type AiQuotaDecision =
  | { ok: true }
  | { ok: false; reason: "disabled" }
  | { ok: false; reason: "daily" | "monthly"; limit: number; retryAt: Date };

/**
 * Pode chamar agora? `recent` são os instantes das chamadas da pessoa nos
 * últimos 30 dias, em qualquer ordem. Estourada, diz quando a janela libera a
 * próxima: quando sai dela a chamada que a fez chegar ao limite.
 */
export function aiQuotaDecision(recent: Date[], limits: AiLimits, now: Date): AiQuotaDecision {
  if (limits.daily === 0 || limits.monthly === 0) return { ok: false, reason: "disabled" };

  const sorted = recent.map((d) => d.getTime()).sort((a, b) => a - b);
  let worst: Extract<AiQuotaDecision, { retryAt: Date }> | null = null;
  for (const reason of ["daily", "monthly"] as const) {
    const window = AI_WINDOWS[reason];
    const limit = limits[reason];
    const inWindow = sorted.filter((t) => t > now.getTime() - window);
    if (inWindow.length < limit) continue;
    const retryAt = new Date(inWindow[inWindow.length - limit] + window);
    if (!worst || retryAt > worst.retryAt) worst = { ok: false, reason, limit, retryAt };
  }
  return worst ?? { ok: true };
}

function whenText(date: Date): string {
  const day = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(date);
  const time = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(date);
  return `${day} às ${time}`;
}

/** O texto da recusa, para a pessoa saber o que houve e quando volta. */
export function aiQuotaMessage(decision: Exclude<AiQuotaDecision, { ok: true }>): string {
  if (decision.reason === "disabled") return "As análises com IA estão desligadas no momento.";
  const span = decision.reason === "daily" ? "nas últimas 24 horas" : "nos últimos 30 dias";
  const plural = decision.limit === 1 ? "análise" : "análises";
  return `Você já usou ${decision.limit} ${plural} com IA ${span}, o limite. Libera de novo em ${whenText(decision.retryAt)}.`;
}

/**
 * A API não chegou a gerar resposta (fora do ar, sem rede, pedido recusado
 * por ela): não houve consumo, e a chamada não deve contar na cota. Qualquer
 * outro erro veio depois da resposta, que já custou tokens.
 */
export function aiCallWasNotBilled(error: unknown): boolean {
  return error instanceof APIError;
}

/**
 * O que a cota precisa do banco. Fica atrás desta interface para os testes
 * usarem um falso; a implementação de verdade está em ai-quota-store.ts.
 */
export interface AiUsageStore {
  /**
   * Com a pessoa travada (ninguém mais grava chamada dela ao mesmo tempo):
   * lê as chamadas desde `since` e, se `decide` deixar, grava uma nova.
   * Devolve o id gravado, ou a decisão de não deixar.
   */
  reserve(
    userId: string,
    feature: AiFeature,
    since: Date,
    decide: (recent: Date[]) => AiQuotaDecision,
  ): Promise<{ id: string } | { refused: Exclude<AiQuotaDecision, { ok: true }> }>;
  release(id: string): Promise<void>;
}

/**
 * Roda `call` se a pessoa ainda tem cota, contando a chamada antes. Sem cota,
 * recusa com o motivo e quando libera. Se a API nem respondeu, devolve a
 * chamada à cota.
 */
export async function withAiQuota<T>(
  store: AiUsageStore,
  userId: string,
  feature: AiFeature,
  call: () => Promise<T>,
  options: { limits?: AiLimits; now?: Date } = {},
): Promise<T> {
  const limits = options.limits ?? aiLimitsFrom(process.env);
  const now = options.now ?? new Date();
  const reserved = await store.reserve(
    userId,
    feature,
    new Date(now.getTime() - AI_WINDOWS.monthly),
    (recent) => aiQuotaDecision(recent, limits, now),
  );
  if ("refused" in reserved) throw new Refusal(aiQuotaMessage(reserved.refused));

  try {
    return await call();
  } catch (error) {
    if (aiCallWasNotBilled(error)) {
      await store.release(reserved.id).catch((e) => console.error("Cota de IA: falha ao devolver", e));
    }
    throw error;
  }
}
