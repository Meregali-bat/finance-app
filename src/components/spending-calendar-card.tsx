"use client";

import { CreditCard } from "lucide-react";
import { homeCard } from "@/components/home-card";
import { useHistoryDay } from "@/components/history-day";
import { SectionLabel } from "@/components/page-header";
import { formatCurrency } from "@/lib/format";
import type { CalendarDay, SpendingCalendar } from "@/lib/spending-calendar";
import { cn } from "@/lib/utils";

// Abreviados, e não só a inicial: "S T Q Q S S D" repetia letras.
const WEEKDAYS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

/** O rosé do gasto em quatro forças; o nível 0 é o trilho vazio. */
const LEVEL_BG = [
  "var(--track)",
  "color-mix(in oklab, var(--chart-1) 22%, transparent)",
  "color-mix(in oklab, var(--chart-1) 42%, transparent)",
  "color-mix(in oklab, var(--chart-1) 66%, transparent)",
  "var(--chart-1)",
];

/** "45", "1,2k": cabe numa célula de 40px. */
function cellAmount(total: number) {
  if (total < 1000) return String(Math.round(total));
  return `${(total / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
}

function dayLabel(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/**
 * Cada dia do período pintado pelo quanto saiu nele, no dia a dia. Tocar um
 * dia abre o que foi gasto nele ao lado e filtra a listagem por ele; tocar de
 * novo solta. O dia é um só, o da listagem: o calendário não guarda outro, e
 * limpar o filtro lá embaixo apaga a marca aqui.
 */
export function SpendingCalendarCard({
  calendar,
  today,
}: {
  calendar: SpendingCalendar;
  /** "YYYY-MM-DD" de hoje, para marcar o dia no calendário. */
  today: string;
}) {
  const days = calendar.weeks.flat().filter((d): d is CalendarDay => d !== null);
  const { day: selectedKey, setDay } = useHistoryDay();
  const selected = days.find((d) => d.key === selectedKey) ?? null;

  return (
    <div
      className={homeCard("rise-in flex flex-col gap-4")}
      style={{ "--rise-delay": "140ms" } as React.CSSProperties}
    >
      <div className="flex flex-col gap-1">
        <SectionLabel>Calendário de gastos</SectionLabel>
        <p className="text-[12.5px] text-muted-foreground">
          {calendar.activeDays > 0
            ? `${formatCurrency(calendar.total)} no dia a dia, em ${calendar.activeDays} ${calendar.activeDays === 1 ? "dia" : "dias"}: o cartão no dia da compra, sem contas fixas nem faturas. Por isso não bate com o Gasto.`
            : "Nenhum gasto do dia a dia neste período."}
        </p>
      </div>

      {/* No computador, o dia aberto fica ao lado: embaixo, os quadrados
          esticariam até a largura toda e o mês viraria uma parede. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-6">
        <div className="flex flex-col gap-1.5">
          <div className="grid grid-cols-7 gap-1.5" aria-hidden="true">
            {WEEKDAYS.map((w, i) => (
              <span key={i} className="text-center text-[11px] font-medium text-muted-foreground">
                {w}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5" role="grid" aria-label="Gasto por dia">
            {calendar.weeks.flat().map((day, i) =>
              day === null ? (
                <span key={`empty-${i}`} aria-hidden="true" />
              ) : (
                <button
                  key={day.key}
                  type="button"
                  // A listagem embaixo passa a mostrar só este dia; o mesmo
                  // dia de novo volta a mostrar o período todo.
                  onClick={() => setDay(day.key === selectedKey ? null : day.key)}
                  aria-pressed={day.key === selectedKey}
                  aria-current={day.key === today ? "date" : undefined}
                  aria-label={`${dayLabel(day.key)}${day.key === today ? " (hoje)" : ""}: ${day.future ? "ainda não chegou" : day.total > 0 ? formatCurrency(day.total) : "nada gasto"}`}
                  className={cn(
                    "flex aspect-square min-w-0 lg:aspect-auto lg:h-16 flex-col justify-between rounded-[10px] p-1.5 text-left transition-[box-shadow,transform] duration-150 active:scale-95 lg:p-2",
                    day.future && "opacity-45",
                    day.key === selectedKey
                      ? "shadow-[inset_0_0_0_2px_var(--foreground)]"
                      : "hover:shadow-[inset_0_0_0_1px_var(--hairline-strong)]",
                  )}
                  style={{ background: LEVEL_BG[day.level] }}
                >
                  <span
                    className={cn(
                      "text-[11px] leading-none font-medium tabular-nums lg:text-xs",
                      day.level === 4
                        ? "text-[#2a1210]"
                        : day.level === 3
                          ? "text-foreground"
                          : "text-muted-foreground",
                    )}
                  >
                    {day.day}
                    {/* Hoje: um ponto ao lado do número, nas duas cores. */}
                    {day.key === today && (
                      <span
                        aria-hidden="true"
                        className="ml-1 inline-block size-1.5 rounded-full bg-current align-middle"
                      />
                    )}
                  </span>
                  {day.total > 0 && (
                    <span
                      className={cn(
                        "truncate text-[11px] leading-none font-semibold tabular-nums lg:text-[12.5px]",
                        // O rosé cheio é o mesmo nos dois temas: tinta escura
                        // nele (branco dava 3,4:1). No nível 3, a cor do tema.
                        day.level === 4 && "text-[#2a1210]",
                      )}
                    >
                      {cellAmount(day.total)}
                    </span>
                  )}
                </button>
              ),
            )}
          </div>
          <div
            className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground"
            aria-hidden="true"
          >
            <span className="mr-1">menos</span>
            {LEVEL_BG.map((bg, i) => (
              <span key={i} className="size-3 rounded-[4px]" style={{ background: bg }} />
            ))}
            <span className="ml-1">mais</span>
          </div>
        </div>

        {selected ? (
          <div
            className="flex flex-col gap-2 border-t border-(--hairline) pt-3 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6"
            aria-live="polite"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium first-letter:uppercase">
                {dayLabel(selected.key)}
              </span>
              <span className="text-sm font-semibold tabular-nums">
                {selected.total > 0 ? formatCurrency(selected.total) : "—"}
              </span>
            </div>
            {selected.entries.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground">
                {selected.future ? "Esse dia ainda não chegou." : "Nada gasto no dia a dia."}
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {selected.entries.map((entry, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate">{entry.description}</span>
                      {entry.cardName && (
                        <span className="flex shrink-0 items-center gap-1 text-[11.5px] text-muted-foreground">
                          <CreditCard className="size-3" aria-hidden="true" />
                          {entry.cardName}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatCurrency(entry.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="border-t border-(--hairline) pt-3 text-[12.5px] text-muted-foreground lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
            Escolha um dia para ver o que saiu nele e filtrar a lista abaixo.
          </p>
        )}
      </div>
    </div>
  );
}
