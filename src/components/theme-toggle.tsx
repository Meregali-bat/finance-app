"use client";

import { useState, useTransition } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { setTheme } from "@/lib/actions/theme";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "system", label: "Automático", icon: Monitor },
];

/** Troca na hora (no <html>) e grava a escolha em segundo plano. */
function useTheme(initial: Theme) {
  const [theme, setLocal] = useState(initial);
  const [, startTransition] = useTransition();
  function choose(next: Theme) {
    setLocal(next);
    document.documentElement.dataset.theme = next;
    startTransition(() => setTheme(next));
  }
  return [theme, choose] as const;
}

/** Os três temas lado a lado: a barra lateral tem espaço para isso. */
export function ThemeSwitcher({ initial, className }: { initial: Theme; className?: string }) {
  const [theme, choose] = useTheme(initial);
  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      className={cn(
        "flex rounded-[14px] bg-card p-1 shadow-[inset_0_0_0_1px_var(--hairline)]",
        className,
      )}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          title={label}
          onClick={() => choose(value)}
          className={cn(
            "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[10px] text-xs font-semibold transition-colors duration-150",
            theme === value
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}

/** No celular, um botão só que passa de um tema para o próximo. */
export function ThemeCycleButton({ initial, className }: { initial: Theme; className?: string }) {
  const [theme, choose] = useTheme(initial);
  const index = OPTIONS.findIndex((o) => o.value === theme);
  const current = OPTIONS[index] ?? OPTIONS[1];
  const next = OPTIONS[(index + 1) % OPTIONS.length];
  const Icon = current.icon;
  return (
    <button
      type="button"
      onClick={() => choose(next.value)}
      aria-label={`Tema: ${current.label}. Trocar para ${next.label}`}
      title={`Tema: ${current.label}`}
      className={cn(
        "flex size-11 items-center justify-center rounded-full text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-muted hover:text-foreground active:scale-[0.92]",
        className,
      )}
    >
      <Icon className="size-[18px]" aria-hidden="true" />
    </button>
  );
}
