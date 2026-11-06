"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { grantAiConsent, revokeAiConsent } from "@/lib/actions/consent";
import { errorMessage } from "@/lib/error-message";

const date = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(iso));

/**
 * Perfil > Privacidade: o que a pessoa aceitou e quando, e a autorização da
 * IA, que se revoga aqui mesmo (LGPD, art. 8º, § 5º).
 */
export function PrivacySettings({
  termsAcceptedAt,
  aiGrantedAt,
}: {
  termsAcceptedAt: string | null;
  aiGrantedAt: string | null;
}) {
  const [ai, setAi] = useState(aiGrantedAt);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggle() {
    setError(null);
    start(async () => {
      try {
        if (ai) {
          await revokeAiConsent();
          setAi(null);
        } else {
          await grantAiConsent();
          setAi(new Date().toISOString());
        }
      } catch (e) {
        setError(errorMessage(e, "Não deu para salvar. Tente de novo."));
      }
    });
  }

  return (
    <div className="flex flex-col gap-4 text-[13.5px]">
      <p className="text-muted-foreground">
        {termsAcceptedAt ? `Você aceitou os termos e a política em ${date(termsAcceptedAt)}. ` : ""}
        <Link href="/termos" className="font-semibold text-foreground underline underline-offset-2">
          Termos de uso
        </Link>{" "}
        ·{" "}
        <Link href="/privacidade" className="font-semibold text-foreground underline underline-offset-2">
          Política de privacidade
        </Link>
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="font-semibold">Envio de dados para a IA</p>
          <p className="text-muted-foreground">
            {ai
              ? `Autorizado em ${date(ai)}. As análises mandam seus dados para a Anthropic, nos EUA.`
              : "Não autorizado. Nada vai para a Anthropic; as análises com IA pedem antes."}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={toggle}>
          {ai ? "Revogar" : "Autorizar"}
        </Button>
      </div>
      <p className="text-muted-foreground">
        Para ver, exportar ou apagar todos os seus dados, ou apagar a conta, peça pelo contato da{" "}
        <Link href="/privacidade" className="underline underline-offset-2">
          política de privacidade
        </Link>
        . Ainda não há botão para isso no app.
      </p>
      {error && (
        <p role="alert" className="text-negative">
          {error}
        </p>
      )}
    </div>
  );
}
