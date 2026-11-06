"use client";

import { useActionState } from "react";
import { signUp, type SignUpState } from "@/lib/actions/signup";
import { FIELD } from "./field";
import { PasswordInput } from "./password-input";
import { SubmitButton } from "./submit-button";

/**
 * Criar conta: email, senha e o aceite dos termos e da política. O erro chega como estado da action e aparece
 * embaixo do campo que o causou.
 */
export function SignUpForm() {
  const [state, action] = useActionState<SignUpState, FormData>(signUp, null);
  const emailError = state?.field === "email" ? state.error : undefined;
  const passwordError = state?.field === "password" ? state.error : undefined;
  const acceptError = state?.field === "accept" ? state.error : undefined;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <label className="flex flex-col gap-2 text-[13.5px] font-medium">
        Email
        <input
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="voce@email.com"
          defaultValue={state?.email}
          required
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? "signup-email-error" : undefined}
          className={FIELD}
        />
        {emailError && (
          <span
            id="signup-email-error"
            role="alert"
            className="text-[13px] font-normal text-negative"
          >
            {emailError}{" "}
            {emailError.startsWith("Já existe") && (
              <a href="/login" className="font-semibold underline underline-offset-2">
                Entrar
              </a>
            )}
          </span>
        )}
      </label>
      <label className="flex flex-col gap-2 text-[13.5px] font-medium">
        Senha
        <PasswordInput
          autoComplete="new-password"
          minLength={8}
          invalid={!!passwordError}
          describedBy="signup-password-hint"
        />
        <span
          id="signup-password-hint"
          role={passwordError ? "alert" : undefined}
          className={`text-[13px] font-normal ${passwordError ? "text-negative" : "text-muted-foreground"}`}
        >
          {passwordError ?? "Pelo menos 8 caracteres."}
        </span>
      </label>
      {/* O aceite não vem marcado: a LGPD não aceita consentimento presumido. */}
      <label className="flex items-start gap-2.5 text-[13px] leading-snug text-muted-foreground">
        <input
          name="accept"
          type="checkbox"
          required
          aria-invalid={acceptError ? true : undefined}
          aria-describedby={acceptError ? "signup-accept-error" : undefined}
          className="mt-0.5 size-4 shrink-0 accent-(--primary)"
        />
        <span>
          Li e aceito os{" "}
          <a href="/termos" target="_blank" className="font-semibold text-foreground underline underline-offset-2">
            termos de uso
          </a>{" "}
          e a{" "}
          <a href="/privacidade" target="_blank" className="font-semibold text-foreground underline underline-offset-2">
            política de privacidade
          </a>
          .
        </span>
      </label>
      {acceptError && (
        <span id="signup-accept-error" role="alert" className="-mt-2 text-[13px] text-negative">
          {acceptError}
        </span>
      )}
      <SubmitButton label="Criar conta" pendingLabel="Criando conta…" />
    </form>
  );
}
