"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface Cycle {
  key: string;
  /** "Agora", "nov", "dez". */
  label: string;
  /** O ano, só no primeiro ciclo de cada ano à frente — marca a virada. */
  year?: string;
  value: number;
  /** O valor exato, para o ciclo selecionado, o tooltip e a tabela. */
  valueLabel: string;
  /** "R$ 3,2 mil" — o rótulo que cabe sobre a coluna. */
  compactLabel: string;
  /** O período por extenso: "05 nov – 04 dez". */
  detail: string;
  href: string;
  selected: boolean;
}

/** Espaço acima e abaixo das marcas para os rótulos de valor. */
const LABEL_SPACE = 22;

/**
 * Livre para gastar (para cima, turquesa) ou falta (para baixo, coral) de cada
 * ciclo, em torno do zero. Diferente do `ColumnChart`, aqui todo ciclo leva o
 * valor — compacto — porque comparar um com o outro é o ponto do gráfico; o
 * exato fica no selecionado, no tooltip e na tabela. Cada coluna é o link para
 * o ciclo, e a faixa inteira dela é clicável.
 */
export function CycleTimeline({
  cycles,
  height = 200,
  title,
}: {
  cycles: Cycle[];
  height?: number;
  title: string;
}) {
  const [active, setActive] = useState<string | null>(null);

  const maxUp = Math.max(0, ...cycles.map((c) => c.value));
  const maxDown = Math.max(0, ...cycles.map((c) => -c.value));
  // Sem nenhum lado negativo, não sobra espaço para rótulo embaixo do zero.
  const top = maxUp > 0 ? LABEL_SPACE : 4;
  const bottom = maxDown > 0 ? LABEL_SPACE : 4;
  const plot = height - top - bottom;
  const span = maxUp + maxDown || 1;
  // Distância do zero ao topo do gráfico, em px.
  const zero = top + (maxUp / span) * plot;

  return (
    <figure className="flex flex-col gap-2">
      <div className="relative" style={{ height }}>
        {/* Uma linha-guia no topo dá escala sem precisar de eixo; o zero é
            mais firme porque é ele que separa sobra de falta. */}
        {maxUp > 0 && (
          <div
            aria-hidden="true"
            className="absolute inset-x-0 border-t border-dashed border-foreground/8"
            style={{ top }}
          />
        )}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 h-px bg-foreground/20"
          style={{ top: zero }}
        />

        <div className="absolute inset-0 flex items-stretch gap-1 sm:gap-1.5">
          {cycles.map((cycle, index) => {
            const up = cycle.value >= 0;
            const size = (Math.abs(cycle.value) / span) * plot;
            const visible = Math.abs(cycle.value) < 0.005 ? 0 : Math.max(3, size);
            const isActive = active === cycle.key;

            return (
              <Link
                key={cycle.key}
                href={cycle.href}
                aria-label={`${cycle.label} (${cycle.detail}): ${cycle.valueLabel}`}
                aria-current={cycle.selected ? "page" : undefined}
                onPointerEnter={() => setActive(cycle.key)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(cycle.key)}
                onBlur={() => setActive(null)}
                className={cn(
                  "group relative min-w-0 flex-1 rounded-2xl outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring",
                  cycle.selected
                    ? "bg-foreground/[0.06] ring-1 ring-foreground/10"
                    : "hover:bg-foreground/[0.035]",
                )}
              >
                {/* Invólucro posiciona, a marca de dentro anima — `translate`
                    e o `scaleY` da entrada não podem dividir a mesma peça. */}
                <span
                  aria-hidden="true"
                  className="absolute left-1/2 -translate-x-1/2"
                  style={{
                    width: "min(40px, 58%)",
                    ...(up
                      ? { top: zero - visible, height: visible }
                      : { top: zero, height: visible }),
                  }}
                >
                  <span
                    className={cn(
                      "block size-full transition-[filter] duration-200 group-hover:brightness-115",
                      up
                        ? "grow-up rounded-t-[8px] rounded-b-[2px] bg-linear-to-b from-positive to-chart-2"
                        : "grow-down rounded-t-[2px] rounded-b-[8px] bg-linear-to-t from-negative to-chart-3",
                      isActive && "brightness-115",
                    )}
                    style={
                      {
                        "--grow-delay": `${150 + index * 45}ms`,
                      } as React.CSSProperties
                    }
                  />
                </span>

                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute left-1/2 -translate-x-1/2 text-[0.6875rem] whitespace-nowrap tabular-nums transition-colors",
                    cycle.selected
                      ? "font-semibold text-foreground"
                      : "hidden font-medium text-muted-foreground sm:block",
                    !up && "text-negative",
                  )}
                  style={up ? { bottom: height - zero + visible + 5 } : { top: zero + visible + 5 }}
                >
                  {cycle.selected ? cycle.valueLabel : cycle.compactLabel}
                </span>

                {isActive && (
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 flex -translate-x-1/2 flex-col items-center gap-0.5 rounded-xl bg-popover px-3 py-2 text-center whitespace-nowrap shadow-float ring-1 ring-foreground/10"
                  >
                    <span
                      className={cn(
                        "text-sm font-semibold tabular-nums",
                        up ? "text-foreground" : "text-negative",
                      )}
                    >
                      {cycle.valueLabel}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {cycle.detail} · {up ? "livre" : "vai faltar"}
                    </span>
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      <div aria-hidden="true" className="flex gap-1 sm:gap-1.5">
        {cycles.map((cycle) => (
          <span key={cycle.key} className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[0.6875rem] sm:px-2 whitespace-nowrap capitalize transition-colors",
                cycle.selected
                  ? "bg-foreground text-background font-semibold"
                  : "text-muted-foreground",
              )}
            >
              {cycle.label}
            </span>
            <span className="h-3 text-[0.625rem] leading-3 text-muted-foreground/70 tabular-nums">
              {cycle.year}
            </span>
          </span>
        ))}
      </div>

      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {cycles.map((cycle) => (
            <tr key={cycle.key}>
              <th scope="row">{cycle.detail}</th>
              <td>{cycle.valueLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
