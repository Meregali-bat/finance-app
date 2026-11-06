"use client";

import { useActionState } from "react";
import { acceptTerms, type AcceptTermsState } from "@/lib/actions/consent";
import { SubmitButton } from "@/app/login/submit-button";

export function AcceptTermsForm() {
  const [state, action] = useActionState<AcceptTermsState, FormData>(acceptTerms, null);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <label className="flex items-start gap-2.5 text-[13.5px] leading-snug">
        <input
          name="accept"
          type="checkbox"
          required
          aria-invalid={state?.error ? true : undefined}
          aria-describedby={state?.error ? "accept-error" : undefined}
          className="mt-0.5 size-4 shrink-0 accent-(--primary)"
        />
        <span>
          Li e aceito os{" "}
          <a href="/termos" target="_blank" className="font-semibold underline underline-offset-2">
            termos de uso
          </a>{" "}
          e a{" "}
          <a href="/privacidade" target="_blank" className="font-semibold underline underline-offset-2">
            política de privacidade
          </a>
          .
        </span>
      </label>
      {state?.error && (
        <p id="accept-error" role="alert" className="text-[13px] text-negative">
          {state.error}
        </p>
      )}
      <SubmitButton label="Aceitar e continuar" pendingLabel="Salvando…" />
    </form>
  );
}
