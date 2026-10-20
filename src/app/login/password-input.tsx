"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { FIELD } from "./field";

/** Campo de senha com o botão de mostrar — no celular, digitar às cegas erra. */
export function PasswordInput({
  autoComplete,
  invalid,
  describedBy,
  minLength,
}: {
  autoComplete: "current-password" | "new-password";
  invalid?: boolean;
  describedBy?: string;
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="relative block">
      <input
        name="password"
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        required
        minLength={minLength}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={`${FIELD} pr-12`}
      />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        aria-label={visible ? "Esconder senha" : "Mostrar senha"}
        title={visible ? "Esconder senha" : "Mostrar senha"}
        className="absolute inset-y-0 right-1 my-auto flex size-10 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:text-foreground"
      >
        {visible ? (
          <EyeOff className="size-[18px]" aria-hidden="true" />
        ) : (
          <Eye className="size-[18px]" aria-hidden="true" />
        )}
      </button>
    </span>
  );
}
