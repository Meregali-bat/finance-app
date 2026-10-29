"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface LinePoint {
  key: string;
  /** O rótulo do eixo: "nov", "12". Vazio = sem rótulo naquele ponto. */
  label: string;
  /** Uma segunda linha no eixo, como o ano na virada. */
  sublabel?: string;
  value: number;
  /** O valor exato: tooltip, ponto selecionado e tabela. */
  valueLabel: string;
  /** O valor curto ("R$ 3,2 mil"), para os rótulos sobre os pontos. */
  compactLabel?: string;
  /** Uma linha a mais no tooltip e na tabela: o período, um estado. */
  detail?: string;
  href?: string;
  selected?: boolean;
  /** Contexto de fundo (uma fatura já paga): ponto acinzentado. */
  muted?: boolean;
}

/**
 * Uma série no tempo, em linha com área. Substitui as colunas.
 *
 * - "polarity": em torno do zero — acima, turquesa (sobra); abaixo, coral
 *   (falta). A linha e a área trocam de cor exatamente no zero, por recorte.
 * - "accent": uma série só, em rosé, a partir da base.
 *
 * Os pontos e rótulos ficam em HTML por cima do SVG esticado — lá eles virariam
 * elipses. Cada ponto tem uma faixa vertical inteira como alvo de toque, que é
 * também o link (quando há) e o que acende o tooltip.
 */
export function LineChart({
  points,
  variant = "accent",
  height = 180,
  title,
  valueLabels = "selected",
}: {
  points: LinePoint[];
  variant?: "polarity" | "accent";
  height?: number;
  title: string;
  /** Quais pontos levam o valor escrito: todos, só o selecionado ou nenhum. */
  valueLabels?: "all" | "selected" | "none";
}) {
  const id = useId().replace(/:/g, "");
  const [active, setActive] = useState<string | null>(null);
  if (points.length === 0) return null;

  const n = points.length;
  const values = points.map((p) => p.value);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  // Espaço para os rótulos acima do mais alto e abaixo do mais baixo.
  const top = 26;
  const bottom = min < 0 ? 26 : 6;
  const plot = height - top - bottom;
  const span = max - min || 1;
  const y = (v: number) => top + ((max - v) / span) * plot;
  const zero = y(0);
  // Cada ponto no centro da sua coluna, alinhado com o rótulo do eixo.
  const x = (i: number) => ((i + 0.5) / n) * 100;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
  const area = `${line} L${x(n - 1)},${zero} L${x(0)},${zero} Z`;

  const up = variant === "polarity" ? "var(--chart-2)" : "var(--chart-1)";
  const down = variant === "polarity" ? "var(--chart-3)" : "var(--chart-1)";
  const colorOf = (p: LinePoint) => (p.muted ? "var(--chart-4)" : p.value < 0 ? down : up);

  // Com muitos pontos (os dias de um mês), as bolinhas viram ruído: fica só a
  // linha, com o ponto em destaque e o que está sob o cursor.
  const dense = n > 14;
  const showValue = (p: LinePoint) =>
    valueLabels === "all" || (valueLabels === "selected" && p.selected);
  const crowded = crowdedLabels(points, y, valueLabels === "all");
  // Num platô, o mesmo rótulo repetido ("R$ 4,1 mil" oito vezes) esconde em
  // vez de mostrar: em qualquer largura fica só o primeiro, e o selecionado.
  const plateau = new Set(
    points.flatMap((p, i) =>
      i > 0 && !p.selected && labelText(points[i - 1]) === labelText(p) ? [i] : [],
    ),
  );
  const activePoint = points.find((p) => p.key === active);

  return (
    <figure className="flex flex-col gap-2">
      <div className="relative" style={{ height }}>
        <svg
          viewBox={`0 0 100 ${height}`}
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={`${id}-up`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: up, stopOpacity: 0.26 }} />
              <stop offset="1" style={{ stopColor: up, stopOpacity: 0.02 }} />
            </linearGradient>
            <linearGradient id={`${id}-down`} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" style={{ stopColor: down, stopOpacity: 0.26 }} />
              <stop offset="1" style={{ stopColor: down, stopOpacity: 0.02 }} />
            </linearGradient>
            <clipPath id={`${id}-above`}>
              <rect x="0" y="0" width="100" height={zero} />
            </clipPath>
            <clipPath id={`${id}-below`}>
              <rect x="0" y={zero} width="100" height={height - zero} />
            </clipPath>
          </defs>

          {/* O zero: mais firme que uma guia, porque separa sobra de falta. */}
          <line
            x1="0"
            x2="100"
            y1={zero}
            y2={zero}
            vectorEffect="non-scaling-stroke"
            style={{ stroke: "var(--hairline-strong)", strokeWidth: 1 }}
          />

          <g className="trend-reveal">
            <path d={area} clipPath={`url(#${id}-above)`} style={{ fill: `url(#${id}-up)` }} />
            <path d={area} clipPath={`url(#${id}-below)`} style={{ fill: `url(#${id}-down)` }} />
            {[
              { clip: "above", color: up },
              { clip: "below", color: down },
            ].map(({ clip, color }) => (
              <path
                key={clip}
                d={line}
                clipPath={`url(#${id}-${clip})`}
                fill="none"
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                strokeLinecap="round"
                style={{ stroke: color, strokeWidth: 2.25 }}
              />
            ))}
          </g>
        </svg>

        {/* Os pontos, os rótulos de valor e as faixas de toque. */}
        <div className="absolute inset-0 flex">
          {points.map((p, i) => {
            const py = y(p.value);
            const below = p.value < 0;
            const isActive = active === p.key;
            const body = (
              <>
                {p.selected && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-1 inset-y-0 rounded-xl bg-foreground/[0.04]"
                  />
                )}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-(--hairline-strong)"
                  />
                )}
                {(!dense || p.selected || isActive) && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "dot-in absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card transition-[width,height] duration-150",
                      p.selected || isActive ? "size-3.5" : "size-2.5",
                    )}
                    style={
                      {
                        top: py,
                        background: colorOf(p),
                        "--rise-delay": `${400 + i * 60}ms`,
                      } as React.CSSProperties
                    }
                  />
                )}
                {showValue(p) && !plateau.has(i) && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute left-1/2 -translate-x-1/2 text-[11px] whitespace-nowrap tabular-nums",
                      // No celular a coluna é mais estreita que "R$ 3,2 mil":
                      // rótulos vizinhos na mesma altura se atropelavam.
                      crowded.has(i) && "max-sm:hidden",
                      p.selected
                        ? "font-semibold text-foreground"
                        : "font-medium text-muted-foreground",
                    )}
                    style={below ? { top: py + 9 } : { top: py - 22 }}
                  >
                    {p.selected ? p.valueLabel : (p.compactLabel ?? p.valueLabel)}
                  </span>
                )}
              </>
            );
            const common = {
              className:
                "relative min-w-0 flex-1 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring",
              onPointerEnter: () => setActive(p.key),
              onPointerLeave: () => setActive(null),
              onFocus: () => setActive(p.key),
              onBlur: () => setActive(null),
              "aria-label": `${p.detail ?? p.label}: ${p.valueLabel}`,
              "aria-current": p.selected ? ("page" as const) : undefined,
            };
            return p.href ? (
              <Link key={p.key} href={p.href} {...common}>
                {body}
              </Link>
            ) : (
              <div key={p.key} tabIndex={0} {...common}>
                {body}
              </div>
            );
          })}
        </div>

        {activePoint && (
          <span
            role="tooltip"
            className="pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-full flex-col items-center rounded-xl bg-popover px-3 py-1.5 whitespace-nowrap shadow-float ring-1 ring-foreground/10"
            style={{
              left: `${Math.min(88, Math.max(12, x(points.indexOf(activePoint))))}%`,
              top: Math.max(0, y(activePoint.value) - 14),
            }}
          >
            <span className="text-sm font-semibold tabular-nums">{activePoint.valueLabel}</span>
            {activePoint.detail && (
              <span className="text-xs text-muted-foreground">{activePoint.detail}</span>
            )}
          </span>
        )}
      </div>

      {/* O eixo: um rótulo por coluna, centrado no ponto. O selecionado vira
          uma pílula, para achar de relance onde se está. */}
      <div aria-hidden="true" className="flex">
        {points.map((p) => (
          <span key={p.key} className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] whitespace-nowrap tabular-nums first-letter:uppercase",
                p.selected && p.label
                  ? "bg-foreground font-semibold text-background"
                  : "text-muted-foreground",
              )}
            >
              {p.label}
            </span>
            {p.sublabel && (
              <span className="text-[10px] text-muted-foreground/80 tabular-nums">
                {p.sublabel}
              </span>
            )}
          </span>
        ))}
      </div>

      {/* Os mesmos valores sem depender do hover nem da cor. */}
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.key}>
              <th scope="row">{p.detail ?? p.label}</th>
              <td>{p.valueLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** O texto do rótulo de um ponto: o valor inteiro no selecionado, o curto nos outros. */
function labelText(p: LinePoint) {
  return p.selected ? p.valueLabel : (p.compactLabel ?? p.valueLabel);
}

/**
 * Os rótulos que somem no celular para os vizinhos não se atropelarem: um
 * platô repete o mesmo valor ("R$ 3,2 mil" quatro vezes) e fica só o
 * primeiro; e de dois vizinhos quase na mesma altura, fica o selecionado ou o
 * que veio antes. Dois pontos de distância já cabem lado a lado.
 */
function crowdedLabels(
  points: LinePoint[],
  y: (v: number) => number,
  enabled: boolean,
): Set<number> {
  const hidden = new Set<number>();
  if (!enabled) return hidden;
  const text = labelText;
  const shown: number[] = points.flatMap((p, i) => (p.selected ? [i] : []));
  points.forEach((p, i) => {
    if (p.selected) return;
    const clash = shown.some(
      (j) =>
        Math.abs(j - i) === 1 &&
        (text(points[j]) === text(p) || Math.abs(y(points[j].value) - y(p.value)) < 18),
    );
    if (clash) hidden.add(i);
    else shown.push(i);
  });
  return hidden;
}
