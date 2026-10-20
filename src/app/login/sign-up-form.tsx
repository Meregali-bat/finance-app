"use client";

import { useActionState } from "react";
import { signUp, type SignUpState } from "@/lib/actions/signup";
import { FIELD } from "./field";
import { PasswordInput } from "./password-input";
import { SubmitButton } from "./submit-button";

/**
 * Criar conta: só email e senha. O erro chega como estado da action e aparece
 * embaixo do campo que o causou.
 */
export function SignUpForm() {
  const [state, action] = useActionState<SignUpState, FormData>(signUp, null);
  const emailError = state?.field === "email" ? state.error : undefined;
  const passwordError = state?.field === "password" ? state.error : undefined;

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
      <SubmitButton label="Criar conta" pendingLabel="Criando conta…" />
    </form>
  );
}
