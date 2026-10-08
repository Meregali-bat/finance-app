"use client";

import { useTransition } from "react";

/** "Desfazer" de um adiamento: a ocorrência volta a ser cobrada no mês dela. */
export function UndoDeferralButton({ action }: { action: () => Promise<void> }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => action())}
      className="font-medium text-foreground underline-offset-2 hover:underline disabled:opacity-50"
    >
      {isPending ? "Desfazendo..." : "Desfazer"}
    </button>
  );
}
