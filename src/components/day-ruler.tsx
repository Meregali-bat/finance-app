"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A régua de dias do período: uma barra por dia. Os que passaram ficam cheios,
 * hoje é a barra mais alta (rosa) e os que faltam ficam baixos e apagados.
 *
 * Entra acendendo da esquerda para a direita: todas nascem como "futuro" e
 * viram o estado real numa onda curta, sem overshoot — uma barra que passa da
 * altura certa mostra, por um instante, um dia que não existe. Com movimento
 * reduzido não há transição e ela troca para o estado real de uma vez.
 *
 * O vão entre as barras vem de `--ruler-gap` (2,5px se ninguém definir): quem
 * alinha algo às barras, como a curva do gasto no Início, lê o mesmo valor.
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
      className={cn("flex h-[26px] items-end gap-(--ruler-gap,2.5px) lg:h-7", className)}
    >
      {Array.from({ length: days }, (_, i) => {
        const state = !ready || i > today ? "future" : i === today ? "today" : "past";
        return (
          <span
            key={i}
            className={cn(
              "min-w-0 flex-1 rounded-[3px] transition-[height,background-color] delay-(--ruler-delay) duration-240 ease-out-quint motion-reduce:transition-none",
              state === "past" && "h-[18px] bg-(--hero-ruler-past)",
              state === "today" && "h-full bg-(--hero-ruler-today)",
              state === "future" && "h-3 bg-(--hero-ruler-future)",
            )}
            // A onda inteira cabe em 120ms, com 30 dias ou com 15, e acaba
            // junto com o resto da entrada do Início (~360ms).
            style={{ "--ruler-delay": `${Math.round((i / days) * 120)}ms` } as React.CSSProperties}
          />
        );
      })}
    </div>
  );
}
