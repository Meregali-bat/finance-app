"use client";

import { useTransition } from "react";
import { Undo2 } from "lucide-react";
import { iconButton } from "@/components/ui/icon-button";

/** "Desfazer" de um adiamento: a ocorrência volta a ser cobrada no mês dela. */
export function UndoDeferralButton({ action }: { action: () => Promise<void> }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => action())}
      aria-label="Desfazer adiamento"
      title="Desfazer adiamento"
      className={iconButton({
        tone: "ghost",
        size: "sm",
        className: "text-primary hover:text-primary",
      })}
    >
      <Undo2 aria-hidden="true" />
    </button>
  );
}
