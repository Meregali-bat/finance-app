"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * O papel da cor de uma coluna. Cada gráfico usa um só destes conjuntos:
 *
 * - "positive" e "negative": polaridade em torno do zero (turquesa e coral);
 * - "accent": uma série só, em rosé;
 * - "muted": contexto que fica de fundo (uma fatura já paga, por exemplo).
 *
 * Rosé e coral nunca dividem um gráfico — não se distinguem lado a lado.
 */
export type ColumnTone = "positive" | "negative" | "accent" | "muted";

export interface Column {
  key: string;
  /** O rótulo do eixo: "out", "12". */
  label: string;
  value: number;
  /** O valor já formatado — função não atravessa do servidor para o cliente. */
  valueLabel: string;
  tone: ColumnTone;
  /** Uma linha a mais no tooltip e na tabela: o período, um estado. */
  detail?: string;
  href?: string;
  selected?: boolean;
}

const TONE_FILL: Record<ColumnTone, string> = {
  positive: "bg-chart-2",
  negative: "bg-chart-3",
  accent: "bg-chart-1",
  muted: "bg-chart-4",
};

/**
 * Colunas a partir de uma linha de base no zero: positivas sobem, negativas
 * descem. Marcas finas (até 24px, ponta arredondada de 4px, reta na base),
 * linha de base fina e recessiva, rótulo só na coluna selecionada — o resto
 * fica no tooltip e na tabela, que o leitor de tela encontra.
 */
export function ColumnChart({
  columns,
  height = 160,
  title,
  dimOpacity = 0.7,
  growStep = 50,
  maxWidth = 24,
}: {
  columns: Column[];
  height?: number;
  /** A opacidade das colunas fora da seleção. */
  dimOpacity?: number;
  /** O escalonamento da entrada: cada coluna cresce da base este tanto depois da anterior. */
  growStep?: number;
  /** A largura máxima da marca, em px. */
  maxWidth?: number;
  /** O que o gráfico mostra — vira o nome da tabela acessível. */
  title: string;
}) {
  const [active, setActive] = useState<string | null>(null);

  const maxUp = Math.max(0, ...columns.map((c) => c.value));
  const maxDown = Math.max(0, ...columns.map((c) => -c.value));
  const span = maxUp + maxDown || 1;
  // Onde fica o zero, de baixo para cima, em fração da altura.
  const baseline = maxDown / span;
  // Espaço para o rótulo da coluna selecionada não sair do gráfico.
  const plot = height - 20;

  return (
    <figure className="flex flex-col gap-2">
      <div className="relative" style={{ height }}>
        <div
          aria-hidden="true"
          className="absolute inset-x-0 h-px bg-foreground/15"
          style={{ bottom: 10 + baseline * plot }}
        />
        <div className="absolute inset-0 flex items-stretch gap-1">
          {columns.map((column, index) => {
            const size = (Math.abs(column.value) / span) * plot;
            const up = column.value >= 0;
            const visible = column.value === 0 ? 0 : Math.max(2, size);
            const isActive = active === column.key;
            const dim = columns.some((c) => c.selected) && !column.selected && !isActive;

            const bar = (
              <>
                {/* A marca fica num invólucro: o invólucro centraliza com
                    `translate`, e a marca cresce da base com `transform` — os
                    dois na mesma peça se sobrescreveriam. */}
                <span
                  aria-hidden="true"
                  className="absolute left-1/2 -translate-x-1/2"
                  style={{
                    width: `min(${maxWidth}px, 60%)`,
                    ...(up
                      ? { bottom: 10 + baseline * plot, height: visible }
                      : { top: height - 10 - baseline * plot, height: visible }),
                  }}
                >
                  <span
                    className={cn(
                      "block size-full transition-[opacity,filter] duration-150",
                      TONE_FILL[column.tone],
                      up ? "grow-up rounded-t-[5px]" : "grow-down rounded-b-[5px]",
                      isActive && "brightness-125",
                    )}
                    style={
                      {
                        opacity: dim ? dimOpacity : 1,
                        "--grow-delay": `${150 + index * growStep}ms`,
                      } as React.CSSProperties
                    }
                  />
                </span>
                {column.selected && (
                  <span
                    aria-hidden="true"
                    className="absolute left-1/2 -translate-x-1/2 text-[0.6875rem] font-semibold whitespace-nowrap text-foreground tabular-nums"
                    style={
                      up
                        ? { bottom: 10 + baseline * plot + visible + 4 }
                        : { top: height - 10 - baseline * plot + visible + 4 }
                    }
                  >
                    {column.valueLabel}
                  </span>
                )}
                {isActive && (
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 flex -translate-x-1/2 flex-col items-center rounded-xl bg-popover px-3 py-2 text-center whitespace-nowrap shadow-float ring-1 ring-foreground/10"
                  >
                    <span className="text-sm font-semibold tabular-nums">{column.valueLabel}</span>
                    <span className="text-xs text-muted-foreground">
                      {column.detail ?? column.label}
                    </span>
                  </span>
                )}
              </>
            );

            const common = {
              className: cn(
                "relative min-w-0 flex-1 rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                // A faixa da coluna selecionada, quando ela é navegável: diz
                // "você está aqui" sem depender só da opacidade.
                column.selected && column.href && "bg-foreground/5",
              ),
              onPointerEnter: () => setActive(column.key),
              onPointerLeave: () => setActive(null),
              onFocus: () => setActive(column.key),
              onBlur: () => setActive(null),
              "aria-label": `${column.detail ?? column.label}: ${column.valueLabel}`,
              "aria-current": column.selected ? ("page" as const) : undefined,
            };

            return column.href ? (
              <Link key={column.key} href={column.href} {...common}>
                {bar}
              </Link>
            ) : (
              <div key={column.key} tabIndex={0} {...common}>
                {bar}
              </div>
            );
          })}
        </div>
      </div>
      {/* O rótulo é centrado na coluna, mas pode passar da largura dela:
          num mês de colunas finas, "13" não cabe em 8px e seria cortado. Por
          isso quem chama rotula só alguns dias. */}
      <div aria-hidden="true" className="flex h-4 gap-1">
        {columns.map((column) => (
          <span key={column.key} className="relative min-w-0 flex-1">
            <span
              className={cn(
                "absolute left-1/2 -translate-x-1/2 text-[0.6875rem] whitespace-nowrap tabular-nums",
                column.selected ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              {column.label}
            </span>
          </span>
        ))}
      </div>
      {/* Os mesmos valores sem depender do hover nem da cor. */}
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {columns.map((column) => (
            <tr key={column.key}>
              <th scope="row">{column.detail ?? column.label}</th>
              <td>{column.valueLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
