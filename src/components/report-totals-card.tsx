import { ArrowDownLeft, ArrowUpRight, BarChart3, Wallet } from "lucide-react";
import { StatLabel } from "@/components/page-header";
import { formatCurrency, formatDate } from "@/lib/format";
import type { ReportTotals } from "@/lib/report-totals";
import { cn } from "@/lib/utils";

/** O saldo da conta numa ponta do período, a partir da leitura do extrato. */
export type PeriodAccount = {
  balance: number;
  /** "Saldo em conta" no período em curso; "Saldo em 30/09" num que já passou. */
  label: string;
  /** Quando o saldo foi conferido com o banco — o ponto de onde a conta parte. */
  checkedAt: Date;
};

/** O período anterior, para dar referência aos números deste. */
export type PreviousTotals = {
  totals: ReportTotals;
  /** "outubro", "o período anterior": como o período é chamado na frase. */
  label: string;
  /** O período anterior já acabou e este ainda corre: os totais não se comparam. */
  partial: boolean;
};

/**
 * Os quatro números do período, cada um num card com ícone: 2×2 no celular,
 * uma faixa de quatro no `xl`.
 *
 * Gasto e Recebido são só o que é seu: o emprestado, as devoluções e o
 * dinheiro entre contas suas ficam numa nota embaixo, para a conta fechar sem
 * inflar o mês. O saldo é o da conta, partindo do que foi conferido com o
 * banco — somar meses não diz quanto há lá.
 *
 * O período anterior entra como referência. Em porcentagem, só a média por
 * dia: com o período em curso, o total de um mês pela metade contra o de um
 * mês inteiro sempre diria "gastou menos", e isso seria mentira. Os totais
 * ganham porcentagem só quando os dois períodos estão completos.
 */
export function ReportTotalsCard({
  totals,
  account,
  previous,
  cumulative,
  daily,
}: {
  totals: ReportTotals;
  /** Nulo quando o saldo nunca foi conferido: aí só o resultado do período. */
  account: PeriodAccount | null;
  previous?: PreviousTotals | null;
  /** O gasto acumulado dia a dia, para a curva do card do Gasto. */
  cumulative?: number[];
  /** O gasto de cada dia, para a curva da média. */
  daily?: number[];
}) {
  const result = totals.received - totals.spent;
  const comparable = previous != null && !previous.partial;
  const figures: Figure[] = [
    {
      label: "Total recebido",
      value: totals.received,
      icon: ArrowDownLeft,
      accent: "var(--positive)",
      notes: [
        totals.repaid >= 0.005 ? `fora ${formatCurrency(totals.repaid)} devolvidos` : "",
        totals.transferred <= -0.005
          ? `fora ${formatCurrency(-totals.transferred)} de outra conta`
          : "",
      ],
      change: comparable ? change(totals.received, previous.totals.received, true, previous.label) : null,
      reference: previous ? `${previous.label}: ${formatCurrency(previous.totals.received)}` : null,
    },
    {
      label: "Total gasto",
      value: totals.spent,
      icon: ArrowUpRight,
      accent: "var(--negative)",
      notes: [
        totals.lent >= 0.005 ? `fora ${formatCurrency(totals.lent)} emprestados` : "",
        totals.transferred >= 0.005
          ? `fora ${formatCurrency(totals.transferred)} para outra conta`
          : "",
      ],
      change: comparable ? change(totals.spent, previous.totals.spent, false, previous.label) : null,
      reference: previous
        ? `${previous.label}${previous.partial ? " inteiro" : ""}: ${formatCurrency(previous.totals.spent)}`
        : null,
      trend: cumulative,
    },
    account
      ? {
          label: account.label,
          value: account.balance,
          icon: Wallet,
          accent: "var(--primary)",
          tone: account.balance < 0 ? "text-negative" : "",
          notes: [`a partir do conferido em ${formatDate(account.checkedAt)}`],
        }
      : {
          label: "Recebido − gasto",
          value: result,
          icon: Wallet,
          accent: "var(--primary)",
          tone: result < 0 ? "text-negative" : "",
          notes: ["confira o saldo do banco na Início para ver o da conta"],
        },
    {
      label: "Média diária",
      value: totals.dailyAverage,
      icon: BarChart3,
      accent: "var(--primary)",
      notes: [],
      change: previous ? change(totals.dailyAverage, previous.totals.dailyAverage, false, previous.label) : null,
      reference: previous
        ? `${previous.label}: ${formatCurrency(previous.totals.dailyAverage)} por dia`
        : null,
      trend: daily,
    },
  ];

  return (
    <div
      className="rise-in grid grid-cols-2 gap-3 lg:gap-4 xl:grid-cols-4"
      style={{ "--rise-delay": "80ms" } as React.CSSProperties}
    >
      {figures.map((figure) => {
        const Icon = figure.icon;
        return (
          <div
            key={figure.label}
            className="flex min-w-0 flex-col gap-3 rounded-[20px] bg-card p-4 shadow-(--shadow-card) lg:flex-row lg:items-start lg:p-5"
          >
            <span
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-full"
              style={{
                background: `color-mix(in oklab, ${figure.accent} 15%, transparent)`,
                color: figure.accent,
              }}
            >
              <Icon className="size-5" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <StatLabel>{figure.label}</StatLabel>
              <p
                className={cn(
                  "font-heading text-xl leading-tight font-bold tracking-[-0.03em] whitespace-nowrap tabular-nums lg:text-[23px]",
                  figure.tone,
                )}
              >
                {formatCurrency(figure.value)}
              </p>
              {figure.change && (
                <p
                  className={cn(
                    "text-xs font-semibold tabular-nums",
                    figure.change.good ? "text-positive" : "text-negative",
                  )}
                >
                  {figure.change.text}
                </p>
              )}
              {[...figure.notes, figure.reference ?? ""].filter(Boolean).map((note) => (
                <p key={note} className="text-xs text-muted-foreground tabular-nums">
                  {note}
                </p>
              ))}
              {figure.trend && figure.trend.length > 1 && (
                <Sparkline values={figure.trend} color={figure.accent} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

type Figure = {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  /** A cor do ícone e da curva. */
  accent: string;
  tone?: string;
  notes: string[];
  change?: { text: string; good: boolean } | null;
  reference?: string | null;
  trend?: number[];
};

/**
 * "↑ 61% vs. outubro". Sem base (o anterior foi zero), não há porcentagem que
 * diga alguma coisa. `upIsGood`: receber mais é bom, gastar mais não.
 */
function change(now: number, before: number, upIsGood: boolean, label: string) {
  if (before < 0.005) return null;
  const pct = Math.round((now / before - 1) * 100);
  if (pct === 0) return { text: `igual a ${label}`, good: true };
  return {
    text: `${pct > 0 ? "↑" : "↓"} ${Math.abs(pct)}% vs. ${label}`,
    good: pct > 0 === upIsGood,
  };
}

/** Uma curva pequena, sem eixo: o desenho do período, não os valores. */
function Sparkline({ values, color }: { values: number[]; color: string }) {
  const w = 120;
  const h = 30;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const y = (v: number) => h - 3 - ((v - min) / (max - min || 1)) * (h - 8);
  const x = (i: number) => (i / (values.length - 1)) * w;
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      className="mt-1.5 h-7 w-full max-w-36"
    >
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={color} opacity={0.12} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
