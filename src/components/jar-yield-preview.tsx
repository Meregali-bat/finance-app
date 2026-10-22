"use client";

import { iofRate, irRate, simulateLotsYield } from "@/lib/jar-yield";
import { formatCurrency } from "@/lib/format";

const DAY = 86_400_000;

/** "2026-11-05" → meia-noite UTC, a forma das datas de calendário do app. */
export function dayFromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function shortDay(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" })
    .format(date)
    .replace(".", "");
}

function percent(rate: number) {
  return `${(rate * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

/** Uma entrada na caixinha: quanto e desde quando ("YYYY-MM-DD"). */
export interface LotView {
  from: string;
  amount: number;
}

/**
 * Quanto o dinheiro devolve na data do resgate, com o que o IOF e o IR levam.
 * Cada entrada rende e paga imposto pela própria data: a que entrou há mais de
 * 30 dias já não tem IOF. O número grande é o que sai no dia; o verde, o que
 * se ganha a mais por ter deixado lá.
 */
export function JarYieldPreview({
  lots,
  cdiAnnualPercent,
  cdiPercent,
  to,
}: {
  lots: LotView[];
  cdiAnnualPercent: number;
  cdiPercent: number;
  /** "YYYY-MM-DD". */
  to: string;
}) {
  const end = dayFromKey(to);
  const valid = lots
    .filter((lot) => lot.amount > 0 && lot.from)
    .map((lot) => ({ from: dayFromKey(lot.from), amount: lot.amount }));
  const latest = Math.max(...valid.map((lot) => lot.from.getTime()));

  if (valid.length === 0 || end.getTime() <= latest) {
    return (
      <p className="rounded-[14px] bg-muted/50 px-3.5 py-3 text-[13px] text-muted-foreground">
        {valid.length === 0
          ? "Digite o valor para ver quanto ele rende até o resgate."
          : "O resgate precisa ser depois do dia em que o dinheiro entrou."}
      </p>
    );
  }

  const r = simulateLotsYield({ lots: valid, cdiAnnualPercent, cdiPercent, to: end });
  const single = r.lots.length === 1 ? r.lots[0] : null;
  // Com IOF, vale mostrar o que mudaria esperando: ele zera 30 dias depois da
  // entrada mais nova.
  const iofFreeDay = new Date(latest + 30 * DAY);
  const iofFree =
    r.iof > 0
      ? simulateLotsYield({ lots: valid, cdiAnnualPercent, cdiPercent, to: iofFreeDay })
      : null;
  const iofLabel = single
    ? `IOF · ${percent(iofRate(single.calendarDays))} do rendimento (antes de 30 dias)`
    : "IOF · das entradas com menos de 30 dias";
  const irRates = new Set(r.lots.map((lot) => irRate(lot.calendarDays)));

  const rows: { label: string; value: string }[] = [
    {
      label: single
        ? `Rendimento bruto · ${single.businessDays} ${single.businessDays === 1 ? "dia útil" : "dias úteis"}`
        : "Rendimento bruto",
      value: formatCurrency(r.gross),
    },
    ...(r.iof > 0 ? [{ label: iofLabel, value: `−${formatCurrency(r.iof)}` }] : []),
    ...(r.ir > 0
      ? [
          {
            label:
              irRates.size === 1
                ? `Imposto de renda · ${percent([...irRates][0])}`
                : "Imposto de renda",
            value: `−${formatCurrency(r.ir)}`,
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-3 rounded-[16px] bg-muted/40 p-3.5 ring-1 ring-(--hairline)">
      <div className="flex flex-col gap-0.5">
        <span className="text-[12.5px] text-muted-foreground">
          {single
            ? `Em ${shortDay(end)}, ${single.calendarDays} ${single.calendarDays === 1 ? "dia" : "dias"} depois da entrada, você tira`
            : `Em ${shortDay(end)} você tira`}
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
            <span className="shrink-0 text-foreground tabular-nums">{row.value}</span>
          </li>
        ))}
      </ul>
      {iofFree && iofFreeDay.getTime() > end.getTime() && (
        <p className="text-[12.5px] text-muted-foreground">
          Deixando até {shortDay(iofFreeDay)}, o IOF zera e o ganho iria a{" "}
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
