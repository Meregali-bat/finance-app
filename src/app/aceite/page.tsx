import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { requireUserId } from "@/lib/auth-helpers";
import { loadConsents } from "@/lib/consent-store";
import { hasCurrentConsent, latestConsent } from "@/lib/legal";
import { logout } from "@/lib/actions/profile";
import { AcceptTermsForm } from "./accept-form";

/**
 * Conta criada antes dos termos, ou termos que mudaram de versão: o app manda
 * para cá (layouts de (app) e /comecar) até a pessoa aceitar a versão atual.
 */
export default async function AcceptPage() {
  const userId = await requireUserId();
  const consents = await loadConsents(userId);
  if (hasCurrentConsent(consents, "terms")) redirect("/");
  const updated = !!latestConsent(consents, "terms");

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center px-5 pt-[max(1.5rem,calc(env(safe-area-inset-top)+1rem))] pb-10">
      <div aria-hidden="true" className="app-backdrop" />
      <div className="flex w-full max-w-[34rem] flex-col gap-8">
        <Logo size="sm" />
        <div className="flex flex-col gap-5 rounded-3xl bg-card-elevated p-7 shadow-(--shadow-panel)">
          <h1 className="font-heading text-[26px] leading-tight font-bold tracking-[-0.03em]">
            {updated ? "Os termos mudaram" : "Antes de continuar"}
          </h1>
          <p className="text-[14.5px] text-muted-foreground">
            {updated
              ? "Atualizamos os termos de uso e a política de privacidade. Leia o que mudou e aceite para continuar usando o Leeway."
              : "O Leeway agora tem termos de uso e política de privacidade, que dizem quais dados guardamos, com quem compartilhamos e como pedir acesso ou exclusão. Leia e aceite para continuar."}
          </p>
          <AcceptTermsForm />
          {/* Quem não aceita precisa de uma saída que não seja fechar a aba. */}
          <form action={logout} className="flex justify-center">
            <button type="submit" className="text-[13px] text-muted-foreground underline underline-offset-2">
              Não aceito, sair da conta
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
