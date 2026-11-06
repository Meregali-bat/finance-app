import { createHash } from "node:crypto";

/**
 * Limite de tentativas no login e no cadastro.
 *
 * Sem ele, qualquer um testa senhas de uma conta sem parar (o bcrypt só deixa
 * cada tentativa mais lenta) e cria contas em lote. Conta por e-mail, para
 * proteger uma conta de quem tenta de vários IPs, e por IP, para quem testa
 * muitas contas de um lugar só.
 *
 * Fica no Postgres (tabela AuthAttempt), e não em memória: na Vercel cada
 * requisição pode cair numa instância diferente, e um contador em memória
 * zera a cada uma. Um Redis (Upstash) seria mais rápido, mas é mais um
 * serviço, conta e variável para manter, para um volume que o banco já aguenta.
 *
 * O limite do IP é folgado de propósito: no celular, muita gente sai pelo
 * mesmo IP da operadora (CGNAT), e um limite apertado travaria inocentes.
 */
export type RateRule = {
  /** Chave legível, ex. "login:email:ana@x.com". Gravada só como hash. */
  key: string;
  limit: number;
  windowMs: number;
};

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

export const AUTH_LIMITS = {
  /** Senhas erradas numa mesma conta. */
  loginEmail: { limit: 5, windowMs: 15 * MINUTE },
  /** Senhas erradas de um mesmo IP, somando todas as contas. */
  loginIp: { limit: 30, windowMs: 15 * MINUTE },
  /** Tentativas de cadastro de um mesmo IP. */
  signupIp: { limit: 5, windowMs: HOUR },
  /** Tentativas de cadastro com um mesmo e-mail (também freia descobrir quem tem conta). */
  signupEmail: { limit: 3, windowMs: HOUR },
} as const;

/** A mais longa das janelas: o que for mais velho que isso pode ser apagado. */
export const LONGEST_WINDOW_MS = Math.max(...Object.values(AUTH_LIMITS).map((l) => l.windowMs));

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * O IP de quem chamou. Na Vercel, `x-real-ip` e o primeiro item de
 * `x-forwarded-for` são escritos pela própria plataforma (o que o cliente
 * manda é sobrescrito), então dá para confiar. Fora dela (dev local) pode não
 * vir nada: aí não há limite por IP, só por e-mail.
 */
export function clientIp(headers: Headers): string | null {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || null;
}

export function loginRules(email: string, ip: string | null): RateRule[] {
  const rules: RateRule[] = [{ key: `login:email:${normalizeEmail(email)}`, ...AUTH_LIMITS.loginEmail }];
  if (ip) rules.push({ key: `login:ip:${ip}`, ...AUTH_LIMITS.loginIp });
  return rules;
}

export function signupRules(email: string, ip: string | null): RateRule[] {
  const rules: RateRule[] = [{ key: `signup:email:${normalizeEmail(email)}`, ...AUTH_LIMITS.signupEmail }];
  if (ip) rules.push({ key: `signup:ip:${ip}`, ...AUTH_LIMITS.signupIp });
  return rules;
}

/**
 * O que vai para o banco no lugar da chave: e-mail e IP são dado pessoal, e a
 * tabela não precisa deles legíveis, só de saber quando a mesma chave voltou.
 */
export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export type RateDecision = { ok: true } | { ok: false; retryAt: Date };

/**
 * Cabe mais uma? `recent[i]` são os instantes das tentativas já contadas para
 * `rules[i]`, em qualquer ordem. Estourada, diz quando libera: quando sai da
 * janela a tentativa que fez chegar ao limite. Com várias regras estouradas,
 * vale a que libera mais tarde.
 */
export function rateDecision(rules: RateRule[], recent: Date[][], now: Date): RateDecision {
  let retryAt: Date | null = null;
  rules.forEach((rule, i) => {
    const inWindow = (recent[i] ?? [])
      .map((d) => d.getTime())
      .filter((t) => t > now.getTime() - rule.windowMs)
      .sort((a, b) => a - b);
    if (inWindow.length < rule.limit) return;
    const at = new Date(inWindow[inWindow.length - rule.limit] + rule.windowMs);
    if (!retryAt || at > retryAt) retryAt = at;
  });
  return retryAt ? { ok: false, retryAt } : { ok: true };
}

/** Minutos até liberar, arredondando para cima: nunca promete cedo demais. */
export function retryMinutes(retryAt: Date, now: Date): number {
  return Math.max(1, Math.ceil((retryAt.getTime() - now.getTime()) / MINUTE));
}

/**
 * "Muitas tentativas. Tente de novo em 12 minutos." Sem um número que faça
 * sentido (a tela de login lê da URL, que qualquer um escreve), fica vago.
 */
export function rateLimitMessage(minutes: number | null): string {
  if (minutes === null || !Number.isInteger(minutes) || minutes < 1 || minutes > 24 * 60) {
    return "Muitas tentativas. Espere alguns minutos e tente de novo.";
  }
  const span = minutes === 1 ? "1 minuto" : `${minutes} minutos`;
  return `Muitas tentativas. Tente de novo em ${span}.`;
}

/**
 * O que o limite precisa do banco. Atrás desta interface para os testes
 * usarem um falso; a de verdade está em auth-rate-limit-store.ts.
 */
export interface AttemptStore {
  /**
   * Com as chaves travadas (ninguém mais grava nelas ao mesmo tempo): lê as
   * tentativas de cada regra desde o início da janela dela e, se `decide`
   * deixar, grava uma nova em cada. Devolve os ids gravados ou a recusa.
   */
  reserve(
    rules: RateRule[],
    now: Date,
    decide: (recent: Date[][]) => RateDecision,
  ): Promise<{ ids: string[] } | { refused: Extract<RateDecision, { ok: false }> }>;
  /** Apaga tentativas gravadas (pelos ids). */
  release(ids: string[]): Promise<void>;
  /** Zera uma chave inteira: o login certo limpa as senhas erradas da conta. */
  clear(key: string): Promise<void>;
}

/**
 * Conta uma tentativa em todas as regras antes de deixá-la seguir. A contagem
 * vem antes do trabalho (e não depois de uma senha errada) para que cem
 * tentativas em paralelo não passem todas pela mesma leitura.
 */
export async function reserveAttempt(
  store: AttemptStore,
  rules: RateRule[],
  now: Date = new Date(),
): Promise<{ ok: true; ids: string[] } | { ok: false; minutes: number }> {
  const result = await store.reserve(rules, now, (recent) => rateDecision(rules, recent, now));
  if ("refused" in result) return { ok: false, minutes: retryMinutes(result.refused.retryAt, now) };
  return { ok: true, ids: result.ids };
}

/**
 * O que o login faz em volta da checagem de senha: reserva a tentativa,
 * checa e, se a senha estava certa, devolve a tentativa e limpa as erradas
 * da conta. Só senha errada conta no limite do login.
 */
export async function guardLogin<T>(
  store: AttemptStore,
  email: string,
  ip: string | null,
  check: () => Promise<T | null>,
  now: Date = new Date(),
): Promise<{ limited: true; minutes: number } | { limited: false; result: T | null }> {
  const rules = loginRules(email, ip);
  const reserved = await reserveAttempt(store, rules, now);
  if (!reserved.ok) return { limited: true, minutes: reserved.minutes };

  let result: T | null;
  try {
    result = await check();
  } catch (error) {
    // Erro nosso (banco fora), não senha errada: não pune a pessoa.
    await store.release(reserved.ids).catch(() => {});
    throw error;
  }
  if (result !== null) {
    await store.release(reserved.ids);
    await store.clear(rules[0].key);
  }
  return { limited: false, result };
}
