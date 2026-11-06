"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/auth-helpers";
import { recordConsent, revokeConsent } from "@/lib/consent-store";

export type AcceptTermsState = { error: string } | null;

/**
 * /aceite: conta criada antes dos termos, ou termos que mudaram de versão.
 * A caixa precisa estar marcada; o servidor confere, não só o navegador.
 */
export async function acceptTerms(_prev: AcceptTermsState, formData: FormData): Promise<AcceptTermsState> {
  const userId = await requireUserId();
  if (formData.get("accept") !== "on") {
    return { error: "Marque que leu e aceita os termos e a política para continuar." };
  }
  await recordConsent(userId, "terms");
  redirect("/");
}

/** "Autorizar" no aviso que aparece antes da primeira análise com IA. */
export async function grantAiConsent() {
  const userId = await requireUserId();
  await recordConsent(userId, "ai");
  revalidatePath("/perfil");
  return { ok: true as const };
}

/** Revogar, no Perfil. O app segue funcionando; só a IA para (art. 8º, § 5º). */
export async function revokeAiConsent() {
  const userId = await requireUserId();
  await revokeConsent(userId, "ai");
  revalidatePath("/", "layout");
  return { ok: true as const };
}
