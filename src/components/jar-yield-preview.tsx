"use client";

import { iofRate, irRate, simulateYield } from "@/lib/jar-yield";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const DAY = 86_400_000;

/** "2026-11-05" → meia-noite UTC, a forma das datas de calendário do app. */
export function dayFromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function shortDay(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" })
    .format(date)
    .replace(".", "");
}

function percent(rate: number) {
  return `${(rate * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

/**
 * Quanto um valor guardado hoje devolve na data do resgate, com o que o IOF e
 * o IR levam. O número grande é o que sai da caixinha no dia; o verde, o que
 * se ganha a mais por ter deixado lá.
 */
export function JarYieldPreview({
  amount,
  cdiAnnualPercent,
  cdiPercent,
  from,
  to,
}: {
  amount: number;
  cdiAnnualPercent: number;
  cdiPercent: number;
  /** "YYYY-MM-DD". */
  from: string;
  to: string;
}) {
  const start = dayFromKey(from);
  const end = dayFromKey(to);
  if (!(amount > 0) || end.getTime() <= start.getTime()) {
    return (
      <p className="rounded-[14px] bg-muted/50 px-3.5 py-3 text-[13px] text-muted-foreground">
        {amount > 0
          ? "Escolha um dia depois de hoje para ver quanto rende."
          : "Digite o valor para ver quanto ele rende até o resgate."}
      </p>
    );
  }

  const r = simulateYield({ amount, cdiAnnualPercent, cdiPercent, from: start, to: end });
  // Com IOF, vale mostrar o que mudaria esperando os 30 dias: numa semana ele
  // leva quase todo o rendimento.
  const iofFree =
    r.iof > 0
      ? simulateYield({
          amount,
          cdiAnnualPercent,
          cdiPercent,
          from: start,
          to: new Date(start.getTime() + 30 * DAY),
        })
      : null;

  const rows: { label: string; value: string; tone?: "minus" }[] = [
    {
      label: `Rendimento bruto · ${r.businessDays} ${r.businessDays === 1 ? "dia útil" : "dias úteis"}`,
      value: formatCurrency(r.gross),
    },
    ...(r.iof > 0
      ? [
          {
            label: `IOF · ${percent(iofRate(r.calendarDays))} do rendimento (antes de 30 dias)`,
            value: `−${formatCurrency(r.iof)}`,
            tone: "minus" as const,
          },
        ]
      : []),
    ...(r.ir > 0
      ? [
          {
            label: `Imposto de renda · ${percent(irRate(r.calendarDays))}`,
            value: `−${formatCurrency(r.ir)}`,
            tone: "minus" as const,
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-3 rounded-[16px] bg-muted/40 p-3.5 ring-1 ring-(--hairline)">
      <div className="flex flex-col gap-0.5">
        <span className="text-[12.5px] text-muted-foreground">
          Em {shortDay(end)}, depois de {r.calendarDays} {r.calendarDays === 1 ? "dia" : "dias"},
          você tira
        </span>
        <span className="font-heading text-[26px] leading-tight font-bold tracking-[-0.03em] tabular-nums">
          {formatCurrency(r.total)}
        </span>
        <span className="text-[13px] font-medium text-positive tabular-nums">
          +{formatCurrency(r.net)} a mais por ter deixado lá
        </span>
      </div>
      <ul className="flex flex-col gap-1.5 border-t border-(--hairline) pt-2.5 text-[12.5px]">
        {rows.map((row) => (
          <li key={row.label} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 text-muted-foreground">{row.label}</span>
            <span
              className={cn(
                "shrink-0 tabular-nums",
                row.tone === "minus" ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {row.value}
            </span>
          </li>
        ))}
      </ul>
      {iofFree && (
        <p className="text-[12.5px] text-muted-foreground">
          Deixando até {shortDay(new Date(start.getTime() + 30 * DAY))} (30 dias), o IOF zera e o
          ganho iria a{" "}
          <span className="font-medium text-foreground tabular-nums">
            {formatCurrency(iofFree.net)}
          </span>
          .
        </p>
      )}
    </div>
  );
}

/** O que a tela das caixinhas sabe para simular: o CDI e as datas de hoje e do próximo pagamento. */
export interface YieldContext {
  cdiAnnualPercent: number;
  /** "21/10/2026", quando veio do Banco Central. */
  cdiDate: string | null;
  cdiSource: "bcb" | "estimate";
  /** "YYYY-MM-DD", no fuso do app. */
  today: string;
  /** O dia do próximo pagamento, "YYYY-MM-DD"; nulo sem renda cadastrada. */
  nextPayday: string | null;
}
