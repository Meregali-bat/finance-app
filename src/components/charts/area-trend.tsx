"use client";

import { useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface TrendPoint {
  /** O rótulo do eixo e do tooltip: "05/10". */
  label: string;
  value: number;
  valueLabel: string;
}

/**
 * Uma série ao longo do tempo: linha de 2px, área a 10% e um ponto no fim com
 * anel da cor do fundo. A mira acha o dia mais perto do ponteiro — ninguém
 * mira numa linha de 2px —, e o tooltip mostra o valor daquele dia.
 *
 * Feita para ficar sobre o card de destaque (fundo garnet), por isso a cor vem
 * de fora: `stroke` pinta linha, área e ponto; o texto nunca usa essa cor.
 */
export function AreaTrend({
  points,
  height = 72,
  stroke = "var(--primary)",
  ring = "var(--rich-mahogany-3)",
  title,
  className,
  reveal = false,
}: {
  points: TrendPoint[];
  /** A altura das contas do SVG; a altura na tela vem de `className`. */
  height?: number;
  stroke?: string;
  ring?: string;
  title: string;
  className?: string;
  /**
   * Entra revelado da esquerda para a direita, e o ponto final aparece no
   * fim. Curto (~400ms): é o gráfico do Início, aberto várias vezes por dia.
   */
  reveal?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const gradientId = `trend-${useId().replace(/:/g, "")}`;
  const hintId = useId();
  const [index, setIndex] = useState<number | null>(null);
  // O que o leitor de tela fala ao percorrer com as setas. Só o teclado
  // escreve aqui: passar o mouse por cima não pode virar uma narração.
  const [spoken, setSpoken] = useState("");

  if (points.length === 0) return null;

  const max = Math.max(...points.map((p) => p.value), 1);
  const width = 100;
  const x = (i: number) => (points.length === 1 ? width : (i / (points.length - 1)) * width);
  const y = (v: number) => height - 4 - (v / max) * (height - 12);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
  const area = `${line} L${x(points.length - 1)},${height} L${x(0)},${height} Z`;
  const last = points.length - 1;
  const shown = index ?? last;

  function track(clientX: number) {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const ratio = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    setIndex(Math.round(ratio * last));
  }

  function scrubTo(i: number) {
    setIndex(i);
    setSpoken(`${points[i].valueLabel} em ${points[i].label}`);
  }

  return (
    <figure className="flex flex-col gap-1">
      <div
        ref={ref}
        // `pan-y`: um arrasto vertical que começa no gráfico ainda rola a
        // página; só o horizontal fica com a mira. Quando o navegador assume a
        // rolagem, ele manda `pointercancel`, e a mira some junto.
        className={cn("relative touch-pan-y outline-none", className)}
        style={className ? undefined : { height }}
        tabIndex={0}
        role="img"
        aria-label={`${title}: ${points[last].valueLabel} em ${points[last].label}`}
        aria-describedby={last > 0 ? hintId : undefined}
        onPointerMove={(e) => track(e.clientX)}
        onPointerDown={(e) => track(e.clientX)}
        onPointerLeave={() => setIndex(null)}
        onPointerCancel={() => setIndex(null)}
        onKeyDown={(e) => {
          const next =
            e.key === "ArrowLeft"
              ? Math.max(0, shown - 1)
              : e.key === "ArrowRight"
                ? Math.min(last, shown + 1)
                : e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? last
                    : null;
          if (next === null) return;
          // Sem isso a seta também rola a página por baixo do gráfico.
          e.preventDefault();
          scrubTo(next);
        }}
        onBlur={() => {
          setIndex(null);
          setSpoken("");
        }}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: stroke, stopOpacity: 0.28 }} />
              <stop offset="1" style={{ stopColor: stroke, stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <g className={reveal ? "trend-reveal-quick" : undefined}>
            <path d={area} fill={`url(#${gradientId})`} />
            <path
              d={line}
              fill="none"
              // Em `style`, não como atributo: atributo de SVG não lê var().
              style={{ stroke }}
              strokeWidth={2.25}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        </svg>
        {index !== null && (
          <span
            aria-hidden="true"
            className="absolute inset-y-0 w-px bg-(--hero-line)"
            style={{ left: `${x(index)}%` }}
          />
        )}
        {/* O ponto em HTML, não no SVG esticado: lá ele viraria uma elipse.
            A posição vertical em porcentagem acompanha a altura da tela. */}
        <span
          aria-hidden="true"
          className={cn(
            "absolute size-[11px] rounded-full",
            // O keyframe já centraliza com `transform`; somar as classes de
            // translate do Tailwind (que usam `translate`) deslocaria o ponto.
            reveal ? "trend-dot" : "-translate-x-1/2 -translate-y-1/2",
          )}
          style={{
            left: `${x(shown)}%`,
            top: `${(y(points[shown].value) / height) * 100}%`,
            background: stroke,
            boxShadow: `0 0 0 3px ${ring}`,
          }}
        />
        {index !== null && (
          // Só visual: o mesmo valor chega ao leitor de tela pela região
          // `aria-live` abaixo, fora do `role="img"` (lá dentro ela seria
          // ignorada: os filhos de uma imagem não são lidos).
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-full z-10 mb-1 flex -translate-x-1/2 flex-col items-center rounded-xl bg-popover px-3 py-1.5 whitespace-nowrap shadow-float ring-1 ring-foreground/10"
            style={{ left: `${Math.min(88, Math.max(12, x(index)))}%` }}
          >
            <span className="text-sm font-semibold tabular-nums">{points[index].valueLabel}</span>
            <span className="text-xs text-muted-foreground">{points[index].label}</span>
          </span>
        )}
      </div>
      <figcaption className="sr-only">{title}</figcaption>
      {last > 0 && (
        <span id={hintId} className="sr-only">
          Use as setas para ver cada dia.
        </span>
      )}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {spoken}
      </span>
    </figure>
  );
}
