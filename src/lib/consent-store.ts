import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Refusal } from "@/lib/action-result";
import {
  AI_CONSENT_REQUIRED,
  CURRENT_VERSION,
  hasCurrentConsent,
  type ConsentKind,
  type ConsentRecord,
} from "@/lib/legal";

/** Os aceites da pessoa, do mais novo ao mais velho. */
export function loadConsents(userId: string): Promise<ConsentRecord[]> {
  return prisma.consent.findMany({
    where: { userId },
    select: { kind: true, version: true, createdAt: true, revokedAt: true },
    orderBy: { createdAt: "desc" },
  });
}

/** Grava o aceite da versão atual. Aceitar de novo cria outra linha. */
export async function recordConsent(userId: string, kind: ConsentKind) {
  await prisma.consent.create({ data: { userId, kind, version: CURRENT_VERSION[kind] } });
}

/** Marca como revogado o que estiver valendo; o histórico fica. */
export async function revokeConsent(userId: string, kind: ConsentKind) {
  await prisma.consent.updateMany({
    where: { userId, kind, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Nas telas do app: sem o aceite dos termos atuais (conta antiga, ou o texto
 * mudou), a pessoa passa por /aceite antes de seguir.
 */
export async function requireCurrentTerms(userId: string) {
  if (!hasCurrentConsent(await loadConsents(userId), "terms")) redirect("/aceite");
}

/**
 * Nas actions de IA, antes da cota e de qualquer envio: o botão já pede o
 * consentimento na tela, mas a action não confia no cliente.
 */
export async function requireAiConsent(userId: string) {
  if (!hasCurrentConsent(await loadConsents(userId), "ai")) throw new Refusal(AI_CONSENT_REQUIRED);
}
