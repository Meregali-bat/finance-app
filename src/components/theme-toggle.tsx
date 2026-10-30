"use client";

import { useState, useTransition } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { setPalette, setTheme } from "@/lib/actions/theme";
import { PALETTES, type Palette, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "system", label: "Automático", icon: Monitor },
];

/**
 * Troca na hora (no <html>) e grava a escolha em segundo plano. O atributo é
 * o mesmo que o servidor escreve ao montar a página, então a próxima carga
 * já nasce igual.
 */
function useHtmlChoice<T extends string>(
  initial: T,
  attribute: "theme" | "palette",
  save: (value: T) => Promise<void>,
) {
  const [value, setLocal] = useState(initial);
  const [, startTransition] = useTransition();
  function choose(next: T) {
    setLocal(next);
    document.documentElement.dataset[attribute] = next;
    startTransition(() => save(next));
  }
  return [value, choose] as const;
}

/** Claro, escuro e automático lado a lado, com ícone e nome. */
export function ThemeSwitcher({ initial, className }: { initial: Theme; className?: string }) {
  const [theme, choose] = useHtmlChoice(initial, "theme", setTheme);
  return (
    <div
      role="radiogroup"
      aria-label="Modo"
      className={cn(
        "flex rounded-[14px] bg-muted p-1 shadow-[inset_0_0_0_1px_var(--hairline)]",
        className,
      )}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          onClick={() => choose(value)}
          className={cn(
            "flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[10px] text-[13px] font-semibold transition-[background-color,color,box-shadow] duration-150",
            theme === value
              ? "bg-card text-foreground shadow-(--shadow-card)"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * As cores do app, cada uma como uma tela em miniatura: o fundo, o card de
 * destaque na cor da marca e duas linhas, uma no tom de destaque. As cores
 * da miniatura seguem o modo da tela (light-dark), então a prévia mostra a
 * paleta como ela vai ficar agora.
 */
export function PalettePicker({ initial }: { initial: Palette }) {
  const [palette, choose] = useHtmlChoice(initial, "palette", setPalette);
  return (
    <div role="radiogroup" aria-label="Cor" className="grid grid-cols-3 gap-2.5 min-[400px]:grid-cols-5">
      {PALETTES.map((p) => {
        const selected = palette === p.value;
        return (
          <button
            key={p.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => choose(p.value)}
            className="group flex min-w-0 flex-col items-center gap-2 rounded-[18px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span
              aria-hidden="true"
              style={{
                background: `light-dark(${p.background.light}, ${p.background.dark})`,
              }}
              className={cn(
                "relative flex aspect-[4/5] w-full flex-col gap-1.5 overflow-hidden rounded-[16px] p-2 shadow-[inset_0_0_0_1px_var(--hairline-strong)] transition-[box-shadow,transform] duration-150 ease-out-quint group-active:scale-[0.96]",
                selected && "shadow-[inset_0_0_0_2px_var(--primary)]",
              )}
            >
              <span
                className="h-[42%] rounded-[8px] shadow-[inset_0_1px_0_rgb(255_255_255/0.15)]"
                style={{ background: `linear-gradient(145deg, ${p.brand}, color-mix(in oklab, ${p.brand} 60%, black))` }}
              />
              <span
                className="h-1.5 w-3/4 rounded-full"
                style={{ background: `light-dark(${p.accent.light}, ${p.accent.dark})` }}
              />
              <span
                className="h-1.5 w-1/2 rounded-full opacity-25"
                style={{ background: `light-dark(${p.accent.light}, ${p.accent.dark})` }}
              />
              {selected && (
                <span className="pop-in absolute right-1.5 bottom-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-3" strokeWidth={3} />
                </span>
              )}
            </span>
            <span
              className={cn(
                "text-[13px] font-medium transition-colors",
                selected ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
              )}
            >
              {p.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
