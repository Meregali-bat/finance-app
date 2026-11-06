/**
 * Política de privacidade, termos de uso e os aceites que a LGPD pede.
 *
 * As versões são a data em que o texto mudou. Mudar uma delas pede o aceite
 * de novo: quem aceitou a versão anterior passa por /aceite (os termos) ou vê
 * o pedido de novo antes da próxima análise com IA (a transferência).
 *
 * O texto das páginas é um RASCUNHO e precisa de revisão jurídica antes de o
 * app abrir para outras pessoas.
 */

/** Termos de uso + política de privacidade, aceitos juntos no cadastro. */
export const LEGAL_VERSION = "2026-11-06";

/**
 * O consentimento para mandar dados à Anthropic, nos EUA, nas análises com
 * IA. É separado do aceite dos termos porque a LGPD pede consentimento
 * "específico e em destaque" para a transferência internacional (art. 33,
 * VIII) e o direito de revogar a qualquer momento (art. 8º, § 5º): o app
 * continua funcionando sem ele, só a IA não.
 */
export const AI_CONSENT_VERSION = "2026-11-06";

export type ConsentKind = "terms" | "ai";

export const CURRENT_VERSION: Record<ConsentKind, string> = {
  terms: LEGAL_VERSION,
  ai: AI_CONSENT_VERSION,
};

/**
 * Quem responde pelos dados (o controlador, art. 5º, VI) e o canal para a
 * pessoa exercer os direitos do art. 18. PREENCHER antes de abrir o app:
 * enquanto estiver nulo, as páginas mostram "[a preencher]".
 */
export const CONTROLLER = {
  name: "Lucas Meregali" as string,
  /** CPF ou CNPJ, se for publicar. Nulo = ainda não decidido. */
  document: null as string | null,
  /** E-mail de contato para privacidade. */
  email: null as string | null,
};

/** O plano pago ainda não está definido: os termos mostram isto no lugar. */
export const PRICING = {
  price: null as string | null,
  trialDays: null as number | null,
};

export const TO_FILL = "[a preencher]";

export interface ConsentRecord {
  kind: string;
  version: string;
  createdAt: Date;
  revokedAt: Date | null;
}

/**
 * O registro que vale para `kind`: o mais recente. Revogar não apaga, só
 * marca `revokedAt`, para o histórico mostrar quando a pessoa aceitou e
 * quando voltou atrás (o ônus da prova do consentimento é do controlador,
 * art. 8º, § 2º).
 */
export function latestConsent(records: ConsentRecord[], kind: ConsentKind): ConsentRecord | null {
  let latest: ConsentRecord | null = null;
  for (const r of records) {
    if (r.kind !== kind) continue;
    if (!latest || r.createdAt > latest.createdAt) latest = r;
  }
  return latest;
}

/** Aceitou a versão atual e não revogou. */
export function hasCurrentConsent(records: ConsentRecord[], kind: ConsentKind): boolean {
  const latest = latestConsent(records, kind);
  return !!latest && !latest.revokedAt && latest.version === CURRENT_VERSION[kind];
}

/** Rotas que qualquer pessoa abre, com ou sem conta. */
export const PUBLIC_PATHS = ["/privacidade", "/termos"] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export const AI_CONSENT_REQUIRED =
  "Para usar as análises com IA, autorize antes o envio dos dados para a Anthropic.";
