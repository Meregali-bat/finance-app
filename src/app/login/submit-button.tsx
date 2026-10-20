"use client";

import { useFormStatus } from "react-dom";

/** O botão do formulário, que troca o rótulo enquanto o servidor trabalha. */
export function SubmitButton({
  label = "Entrar",
  pendingLabel = "Entrando…",
}: {
  label?: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="cta-surface mt-2 h-12 w-full rounded-[14px] text-[15px] font-semibold text-white transition-[transform,box-shadow] duration-150 ease-out-quint active:scale-[0.98] disabled:opacity-80"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
