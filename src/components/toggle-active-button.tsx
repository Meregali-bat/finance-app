"use client";

import { useTransition } from "react";
import { Badge } from "@/components/ui/badge";

export function ToggleActiveButton({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: (next: boolean) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => onToggle(!active))}
      className="cursor-pointer disabled:opacity-50"
    >
      <Badge variant={active ? "default" : "secondary"}>
        {active ? "Ativa" : "Inativa"}
      </Badge>
    </button>
  );
}
