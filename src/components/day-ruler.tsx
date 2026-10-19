"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A régua de dias do período: uma barra por dia. Os que passaram ficam cheios,
 * hoje é a barra mais alta (rosa) e os que faltam ficam baixos e apagados.
 *
 * Entra acendendo da esquerda para a direita: todas nascem como "futuro" e
 * viram o estado real em sequência, com um overshoot na altura. Com movimento
 * reduzido, o globals.css zera as durações e ela já aparece pronta.
 */
export function DayRuler({
  totalDays,
  elapsedDays,
  className,
}: {
  totalDays: number;
  /** Contando hoje: no primeiro dia do período, 1. */
  elapsedDays: number;
  className?: string;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const days = Math.max(1, totalDays);
  const today = Math.min(days, Math.max(1, elapsedDays)) - 1;

  return (
    <div
      aria-hidden="true"
      className={cn("flex h-[26px] items-end gap-[2.5px] lg:h-7 lg:gap-[3px]", className)}
    >
      {Array.from({ length: days }, (_, i) => {
        const state = !ready || i > today ? "future" : i === today ? "today" : "past";
        return (
          <span
            key={i}
            className={cn(
              "min-w-0 flex-1 rounded-[3px]",
              state === "past" && "h-[18px] bg-(--hero-ruler-past)",
              state === "today" && "h-full bg-(--hero-ruler-today)",
              state === "future" && "h-3 bg-(--hero-ruler-future)",
            )}
            style={{
              transition:
                "height 360ms cubic-bezier(0.34,1.56,0.64,1), background-color 360ms ease",
              transitionDelay: `${300 + i * 22}ms`,
            }}
          />
        );
      })}
    </div>
  );
}
