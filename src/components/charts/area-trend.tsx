"use client";

import { useRef, useState } from "react";

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
}: {
  points: TrendPoint[];
  height?: number;
  stroke?: string;
  ring?: string;
  title: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState<number | null>(null);

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

  return (
    <figure className="flex flex-col gap-1">
      <div
        ref={ref}
        className="relative touch-none outline-none"
        style={{ height }}
        tabIndex={0}
        role="img"
        aria-label={`${title}: ${points[last].valueLabel} em ${points[last].label}`}
        onPointerMove={(e) => track(e.clientX)}
        onPointerDown={(e) => track(e.clientX)}
        onPointerLeave={() => setIndex(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setIndex(Math.max(0, shown - 1));
          if (e.key === "ArrowRight") setIndex(Math.min(last, shown + 1));
        }}
        onBlur={() => setIndex(null)}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
          aria-hidden="true"
        >
          <path d={area} fill={stroke} fillOpacity={0.12} />
          <path
            d={line}
            fill="none"
            stroke={stroke}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {index !== null && (
          <span
            aria-hidden="true"
            className="absolute inset-y-0 w-px bg-white/30"
            style={{ left: `${x(index)}%` }}
          />
        )}
        {/* O ponto em HTML, não no SVG esticado: lá ele viraria uma elipse. */}
        <span
          aria-hidden="true"
          className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: `${x(shown)}%`,
            top: y(points[shown].value),
            background: stroke,
            boxShadow: `0 0 0 2px ${ring}`,
          }}
        />
        {index !== null && (
          <span
            role="tooltip"
            className="pointer-events-none absolute bottom-full z-10 mb-1 flex -translate-x-1/2 flex-col items-center rounded-xl bg-popover px-3 py-1.5 whitespace-nowrap shadow-float ring-1 ring-foreground/10"
            style={{ left: `${Math.min(88, Math.max(12, x(index)))}%` }}
          >
            <span className="text-sm font-semibold tabular-nums">
              {points[index].valueLabel}
            </span>
            <span className="text-xs text-muted-foreground">{points[index].label}</span>
          </span>
        )}
      </div>
      <figcaption className="sr-only">{title}</figcaption>
    </figure>
  );
}
