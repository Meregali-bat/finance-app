import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CalendarClock, Wallet } from "lucide-react";
import { requireUserId } from "@/lib/auth-helpers";
import { accountBalanceOf, loadBudgetInputs } from "@/lib/budget-inputs";
import { calculateCurrentBudget } from "@/lib/carry-over";
import {
  forecastPeriods,
  resolveForecastOffset,
  MAX_FORECAST_OFFSET,
  type ForecastEntry,
  type ForecastEntryKind,
  type PeriodForecast,
} from "@/lib/forecast";
import { formatCompactCurrency, formatCurrency, formatDate } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, SectionLabel } from "@/components/page-header";
import { CountUpCurrency } from "@/components/ui/animated-number";
import { IconSquare, ListRow, stagger } from "@/components/list-row";
import { homeCard } from "@/components/home-card";
import { ForecastNav } from "@/components/forecast-nav";
import { CycleTimeline } from "@/components/charts/cycle-timeline";
import { cn } from "@/lib/utils";

/** Quantos ciclos o gráfico mostra, contando o corrente. */
const TIMELINE_LENGTH = 9;

/** "out", "nov" — o mês em que o ciclo começa, sem o ponto da abreviação. */
function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", "");
}

const GROUPS: { kind: ForecastEntryKind; label: string; incoming: boolean }[] = [
  { kind: "income", label: "Entradas previstas", incoming: true },
  { kind: "fixedExpense", label: "Despesas fixas", incoming: false },
  { kind: "cardBill", label: "Faturas", incoming: false },
  { kind: "scheduled", label: "Agendados", incoming: false },
  { kind: "jar", label: "Guardado em caixinhas", incoming: false },
];

/**
 * No ciclo corrente as movimentações em sua maioria já aconteceram, e chamar
 * de "agendado" um almoço de duas semanas atrás seria mentir sobre o que a
 * lista mostra. À frente, todas elas são de fato agendamentos.
 */
function groupLabel(kind: ForecastEntryKind, label: string, offset: number) {
  return kind === "scheduled" && offset === 0 ? "Lançamentos" : label;
}

/** "o ciclo atual", "nov" — como um ciclo é chamado numa frase. */
function cycleName(period: PeriodForecast) {
  return period.offset === 0 ? "o ciclo atual" : monthLabel(period.periodStart);
}

function forecastHref(offset: number) {
  return `/previsao?p=${offset}`;
}

/** O último dia de dentro do ciclo — `periodEnd` é o primeiro de fora. */
function lastDay(period: PeriodForecast) {
  const day = new Date(period.periodEnd);
  day.setDate(day.getDate() - 1);
  return day;
}

function periodLabel(period: PeriodForecast) {
  return `${formatDate(period.periodStart)} – ${formatDate(lastDay(period))}`;
}

/** Onde o ciclo está em relação a hoje, dito em palavras. */
function offsetCaption(offset: number) {
  if (offset === 0) return "Período atual";
  if (offset === 1) return "Próximo período";
  return `Daqui a ${offset} períodos`;
}

function EntryRow({
  entry,
  incoming,
  index,
}: {
  entry: ForecastEntry;
  incoming: boolean;
  index: number;
}) {
  const detail = [
    formatDate(entry.date),
    // "Confirmado" só distingue alguma coisa onde existe o contrário: uma
    // ocorrência recorrente pode estar projetada ou já ter acontecido. Um
    // lançamento é sempre um registro real.
    entry.confirmed && entry.kind !== "scheduled" && entry.kind !== "jar" && "confirmado",
    entry.partial && "fatura ainda aberta",
    entry.deferredIn && `inclui ${formatCurrency(entry.deferredIn)} adiados`,
    // Mostrado mas fora da conta, como na Início: um salário que ninguém disse
    // ter chegado não pode virar saldo.
    entry.awaiting && "aguardando confirmação, fora da conta",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="rise-in" style={stagger(index, 80, 45)}>
      <ListRow
        icon={incoming ? <ArrowDownLeft /> : <ArrowUpRight />}
        tone={incoming ? "positive" : "negative"}
        title={entry.label}
        subtitle={<span className="tabular-nums">{detail}</span>}
        value={`${incoming ? "+" : "−"}${formatCurrency(entry.amount)}`}
        valueClassName={cn(
          incoming ? "text-positive" : "text-foreground",
          entry.awaiting && "text-muted-foreground line-through",
        )}
      />
    </li>
  );
}

export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string | string[] }>;
}) {
  const userId = await requireUserId();
  const { p } = await searchParams;
  const offset = resolveForecastOffset(p);
  const today = new Date();

  // Tudo, inclusive o desligado: quem decide o que cada coisa inativa ainda
  // faz é o módulo puro — renda desligada não é projetada, despesa encerrada
  // para no `endedAt` —, e é a mesma regra que a Início usa.
  const inputs = await loadBudgetInputs(userId);

  // O ciclo corrente parte da mesma herança que a Início mostra: o saldo em
  // conta, quando informado, ou a corrente dos períodos anteriores.
  const budget = calculateCurrentBudget({
    ...inputs,
    accountBalance: accountBalanceOf(inputs, today),
    today,
  });

  // O horizonte inteiro, sempre: a faixa de tendência precisa dos primeiros
  // ciclos, e o aviso de falta precisa achar o pior deles, esteja a navegação
  // onde estiver.
  const periods = forecastPeriods({
    ...inputs,
    openingBalance: budget.openingBalance,
    today,
    count: MAX_FORECAST_OFFSET,
  });

  if (periods.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Previsão" subtitle="Como vai estar o próximo período" />
        <EmptyState
          icon={CalendarClock}
          text="Sem uma renda fixa cadastrada não dá para saber onde um período começa e o outro termina."
          hint="Cadastre sua renda em Fixos para ver a previsão."
        />
      </div>
    );
  }

  const period = periods[offset];
  const isNegative = period.endBalance < -0.005;
  const timeline = periods.slice(0, TIMELINE_LENGTH);
  const timelineShort = timeline.filter((item) => item.endBalance < -0.005);
  // Com falta, o ciclo mais no vermelho; sem, o de menor folga.
  const timelineWorst = timeline.reduce((worst, item) =>
    timelineShort.length > 0
      ? item.endBalance < worst.endBalance
        ? item
        : worst
      : item.freeToSpend < worst.freeToSpend
        ? item
        : worst,
  );

  // O primeiro ciclo, deste em diante, que fecha no vermelho mesmo guardando
  // tudo o que dá. O aviso aparece em todo ciclo até ele: é neles que dá para
  // economizar para cobrir.
  const shortfall =
    periods.find((item) => item.offset >= offset && item.endBalance < -0.005) ?? null;

  const inheritedLabel =
    period.offset > 0
      ? period.inherited < -0.005
        ? "Faltou nos ciclos anteriores"
        : "Guardado dos ciclos anteriores"
      : budget.openingSource === "account"
        ? "Já estava na conta"
        : "Veio dos períodos anteriores";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Previsão"
        subtitle="Quanto cada ciclo pode gastar, levando em conta os outros"
      />

      <ForecastNav
        label={periodLabel(period)}
        caption={offsetCaption(period.offset)}
        previousHref={offset > 0 ? forecastHref(offset - 1) : null}
        nextHref={offset < MAX_FORECAST_OFFSET ? forecastHref(offset + 1) : null}
      />

      <section
        aria-label="Este ciclo"
        className="hero-surface rise-in relative overflow-hidden rounded-[26px] text-white lg:rounded-[28px]"
        style={{ "--rise-delay": "80ms" } as React.CSSProperties}
      >
        <div className="relative z-10 p-1 lg:px-4 lg:py-3">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] overflow-hidden">
            <div className="flex flex-col gap-4 p-[18px] lg:p-5">
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-medium text-white/72">
                  {isNegative ? "Vai faltar ao fim do período" : "Livre para gastar no período"}
                </p>
                {/* Mesmo elemento entre um ciclo e outro (trocar a query não
                    remonta a tela), então o valor conta do anterior até o novo. */}
                <CountUpCurrency
                  value={isNegative ? period.endBalance : period.freeToSpend}
                  duration={0.7}
                  delay={0.2}
                  className={cn(
                    "font-heading text-[44px] leading-none font-bold tracking-[-0.04em] tabular-nums lg:text-[52px]",
                    isNegative ? "text-negative" : "text-white",
                  )}
                />
              </div>
              <p className="text-sm text-white/80 tabular-nums">
                <span className="font-semibold text-white">
                  {formatCurrency(period.dailyAvailable)}
                </span>{" "}
                por dia ·{" "}
                {period.offset === 0
                  ? `${period.daysLeft} ${period.daysLeft === 1 ? "dia restante" : "dias restantes"}`
                  : `${period.totalDays} ${period.totalDays === 1 ? "dia" : "dias"} de ciclo`}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    label: "Entradas",
                    value: period.incomeTotal,
                    icon: (
                      <ArrowDownLeft className="size-4 shrink-0 text-positive" aria-hidden="true" />
                    ),
                  },
                  {
                    label: "Saídas",
                    value:
                      period.fixedExpenseTotal +
                      period.cardBillTotal +
                      period.scheduledTotal +
                      period.jarTotal,
                    icon: (
                      <ArrowUpRight className="size-4 shrink-0 text-negative" aria-hidden="true" />
                    ),
                  },
                ].map((chip) => (
                  <div
                    key={chip.label}
                    className="flex min-w-0 items-center gap-2.5 rounded-2xl bg-black/22 px-3.5 py-2.5 ring-1 ring-white/10"
                  >
                    {chip.icon}
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-[11px] font-semibold tracking-[0.08em] text-white/60 uppercase">
                        {chip.label}
                      </span>
                      <span className="truncate text-[15px] font-semibold tabular-nums">
                        {formatCurrency(chip.value)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* A conta por trás do número grande, como uma fita: o que veio de
                antes, mais o que este ciclo movimenta, menos o que ele guarda
                para a frente. Sem ela, um mês com renda maior que as contas
                aparecer negativo — ou menor do que parece — parece erro. O
                divisor é a mesma sombra de 1px do hero da Início. */}
            <dl className="flex flex-col justify-center gap-2.5 p-[18px] text-[13.5px] tabular-nums shadow-[-1px_-1px_0_0_rgb(255_255_255/0.12)] lg:p-5">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-white/72">{inheritedLabel}</dt>
                <dd className="font-medium">{formatCurrency(period.inherited)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-white/72">Resultado do período</dt>
                <dd className="font-medium">{formatCurrency(period.periodResult)}</dd>
              </div>
              {period.reservedForLater > 0.005 && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-white/72">Reservado para ciclos à frente</dt>
                  <dd className="font-medium">− {formatCurrency(period.reservedForLater)}</dd>
                </div>
              )}
              <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-white/12 pt-3">
                <dt className="font-semibold">
                  {isNegative ? "Falta no fim do ciclo" : "Livre para gastar"}
                </dt>
                <dd className="font-heading text-lg font-bold tracking-[-0.02em]">
                  {formatCurrency(isNegative ? period.endBalance : period.freeToSpend)}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {shortfall && (
        <div
          className="rise-in flex items-start gap-3 rounded-[20px] bg-card p-3.5 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--negative)_30%,transparent)]"
          style={{ "--rise-delay": "160ms" } as React.CSSProperties}
        >
          <IconSquare tone="negative">
            <AlertTriangle />
          </IconSquare>
          <p className="pt-1.5 text-[13.5px] leading-relaxed">
            {shortfall.offset === period.offset
              ? "Neste ciclo"
              : `No ciclo de ${periodLabel(shortfall)}`}
            , o que está comprometido passa do que existe em{" "}
            <span className="font-semibold tabular-nums">
              {formatCurrency(Math.abs(shortfall.endBalance))}
            </span>
            , mesmo sem gastar nada além disso até lá. O que faltar passa para o ciclo seguinte.
          </p>
        </div>
      )}

      {/* Um ciclo por coluna: para cima o que fica livre (turquesa), para
          baixo o que vai faltar (coral) — positivo e negativo em torno do
          zero. Acima, a leitura do gráfico numa frase: quantos fecham no
          vermelho e qual é o pior, ou, sem nenhum, onde a folga é menor. */}
      <div
        className={homeCard("rise-in flex flex-col gap-5")}
        style={{ "--rise-delay": "220ms" } as React.CSSProperties}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="flex flex-col gap-1.5">
            <SectionLabel>Próximos ciclos</SectionLabel>
            <p className="text-[13.5px] text-muted-foreground tabular-nums">
              {timelineShort.length > 0 ? (
                <>
                  <span className="font-semibold text-foreground">
                    {timelineShort.length} de {timeline.length}
                  </span>{" "}
                  {timelineShort.length === 1 ? "ciclo fecha" : "ciclos fecham"} no vermelho · pior
                  em{" "}
                  <span className="font-semibold text-negative">
                    {cycleName(timelineWorst)} ({formatCurrency(timelineWorst.endBalance)})
                  </span>
                </>
              ) : (
                <>
                  Todos os {timeline.length} ciclos fecham no azul · menor folga em{" "}
                  <span className="font-semibold text-foreground">
                    {cycleName(timelineWorst)} ({formatCurrency(timelineWorst.freeToSpend)})
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2.5 rounded-full bg-chart-2" />
              Livre
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2.5 rounded-full bg-chart-3" />
              Vai faltar
            </span>
          </div>
        </div>
        <CycleTimeline
          title="Livre para gastar ou falta, por ciclo"
          cycles={timeline.map((item, index) => {
            const short = item.endBalance < -0.005;
            const value = short ? item.endBalance : item.freeToSpend;
            const previous = timeline[index - 1];
            return {
              key: String(item.offset),
              label: item.offset === 0 ? "Agora" : monthLabel(item.periodStart),
              year:
                previous && previous.periodStart.getFullYear() !== item.periodStart.getFullYear()
                  ? String(item.periodStart.getFullYear())
                  : undefined,
              value,
              valueLabel: formatCurrency(value),
              compactLabel: formatCompactCurrency(value),
              detail: periodLabel(item),
              href: forecastHref(item.offset),
              selected: item.offset === offset,
            };
          })}
        />
      </div>

      {period.entries.length === 0 ? (
        <EmptyState
          icon={Wallet}
          text="Nada comprometido neste período ainda."
          hint="Rendas, despesas fixas, faturas e lançamentos futuros aparecem aqui."
        />
      ) : (
        // Duas colunas a partir de `xl`, como as listas do Início.
        // `items-start` impede a coluna curta de esticar até a altura da outra.
        <div className="flex flex-col gap-6 xl:grid xl:grid-cols-2 xl:items-start">
          {GROUPS.map(({ kind, label, incoming }) => {
            const entries = period.entries.filter((entry) => entry.kind === kind);
            if (entries.length === 0) return null;
            return (
              <div key={kind} className="flex flex-col gap-3">
                <SectionLabel>{groupLabel(kind, label, period.offset)}</SectionLabel>
                <ul className="flex flex-col gap-2">
                  {entries.map((entry, index) => (
                    <EntryRow
                      key={`${entry.kind}-${entry.sourceId}-${entry.date.toISOString()}`}
                      entry={entry}
                      incoming={incoming}
                      index={index}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
