"use client";

import { cn } from "@/lib/utils";

/**
 * O interruptor do app: trilho de 34×20 numa área de toque de 44px, bolinha
 * que desliza com um leve overshoot. Só visual e estado — quem chama decide o
 * que ligar e desligar faz.
 */
export function Switch({
  checked,
  onCheckedChange,
  id,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  id?: string;
  /** Para leitor de tela, quando não há um <label htmlFor> apontando para ele. */
  label?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative h-5 w-[34px] rounded-full transition-colors duration-200",
          checked ? "bg-primary" : "bg-secondary",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-4 rounded-full transition-[translate,background-color] duration-[280ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]",
            checked ? "translate-x-3.5 bg-background" : "bg-muted-foreground",
          )}
        />
      </span>
    </button>
  );
}
