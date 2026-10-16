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
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, SectionLabel } from "@/components/page-header";
import { AnimatedCurrency } from "@/components/ui/animated-number";
import { ForecastNav } from "@/components/forecast-nav";
import { ColumnChart } from "@/components/charts/column-chart";
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

function EntryRow({ entry, incoming }: { entry: ForecastEntry; incoming: boolean }) {
  return (
    <Card
      // Faixa lateral em vez de ícone: a cor diz se o dinheiro entra ou sai
      // antes de o olho chegar no texto, como nos lembretes do Início.
      className={cn(
        "pl-1 before:absolute before:inset-y-0 before:left-0 before:w-1",
        incoming ? "before:bg-positive" : "before:bg-negative",
      )}
    >
      <CardContent className="flex items-center justify-between gap-3 py-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{entry.label}</p>
          <p className="text-sm text-muted-foreground tabular-nums">
            {formatDate(entry.date)}
            {/* "Confirmado" só distingue alguma coisa onde existe o contrário:
                uma ocorrência recorrente pode estar projetada ou já ter
                acontecido. Um lançamento é sempre um registro real. */}
            {entry.confirmed &&
              entry.kind !== "scheduled" &&
              entry.kind !== "jar" &&
              " · confirmado"}
            {entry.partial && " · fatura ainda aberta"}
            {entry.deferredIn && ` · inclui ${formatCurrency(entry.deferredIn)} adiados`}
            {/* Mostrado mas fora da conta, como na Início: um salário que
                ninguém disse ter chegado não pode virar saldo. */}
            {entry.awaiting && " · aguardando confirmação, fora da conta"}
          </p>
        </div>
        <p
          className={cn(
            "shrink-0 font-medium tabular-nums",
            incoming ? "text-positive" : "text-foreground",
            entry.awaiting && "text-muted-foreground line-through",
          )}
        >
          {incoming ? "+" : "−"}
          {formatCurrency(entry.amount)}
        </p>
      </CardContent>
    </Card>
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
        className="hero-surface relative overflow-hidden rounded-[1.75rem] text-white shadow-float ring-1 ring-white/10"
      >
        <div className="relative z-10 flex flex-col gap-6 p-6 lg:p-8 xl:grid xl:grid-cols-[1fr_1fr] xl:gap-10">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <p className="text-sm text-white/70">
                {isNegative ? "Vai faltar ao fim do período" : "Livre para gastar no período"}
              </p>
              <AnimatedCurrency
                value={isNegative ? period.endBalance : period.freeToSpend}
                className={cn(
                  "font-heading text-[3rem] leading-[1] font-bold tracking-[-0.04em] lg:text-[3.75rem]",
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
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-2 rounded-2xl bg-black/20 px-4 py-2.5 ring-1 ring-white/10">
                <ArrowDownLeft className="size-4 shrink-0 text-positive" aria-hidden="true" />
                <div className="flex flex-col">
                  <span className="text-[0.6875rem] font-semibold tracking-[0.08em] text-white/60 uppercase">
                    Entradas
                  </span>
                  <span className="font-medium tabular-nums">
                    {formatCurrency(period.incomeTotal)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-2xl bg-black/20 px-4 py-2.5 ring-1 ring-white/10">
                <ArrowUpRight className="size-4 shrink-0 text-negative" aria-hidden="true" />
                <div className="flex flex-col">
                  <span className="text-[0.6875rem] font-semibold tracking-[0.08em] text-white/60 uppercase">
                    Saídas
                  </span>
                  <span className="font-medium tabular-nums">
                    {formatCurrency(
                      period.fixedExpenseTotal +
                        period.cardBillTotal +
                        period.scheduledTotal +
                        period.jarTotal,
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* A conta por trás do número grande, como uma fita: o que veio de
              antes, mais o que este ciclo movimenta, menos o que ele guarda
              para a frente. Sem ela, um mês com renda maior que as contas
              aparecer negativo — ou menor do que parece — parece erro. */}
          <dl className="flex flex-col justify-center gap-3 border-t border-white/10 pt-5 text-sm tabular-nums xl:border-t-0 xl:border-l xl:pt-0 xl:pl-10">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-white/70">{inheritedLabel}</dt>
              <dd className="font-medium">{formatCurrency(period.inherited)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-white/70">Resultado do período</dt>
              <dd className="font-medium">{formatCurrency(period.periodResult)}</dd>
            </div>
            {period.reservedForLater > 0.005 && (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-white/70">Reservado para ciclos à frente</dt>
                <dd className="font-medium">− {formatCurrency(period.reservedForLater)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-3 border-t border-white/10 pt-3">
              <dt className="font-medium">
                {isNegative ? "Falta no fim do ciclo" : "Livre para gastar"}
              </dt>
              <dd className="font-heading text-lg font-semibold">
                {formatCurrency(isNegative ? period.endBalance : period.freeToSpend)}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {shortfall && (
        <Card className="pl-1 before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-negative">
          <CardContent className="flex items-start gap-3 py-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-negative" aria-hidden="true" />
            <p className="text-sm">
              {shortfall.offset === period.offset
                ? "Neste ciclo"
                : `No ciclo de ${periodLabel(shortfall)}`}
              , o que está comprometido passa do que existe em{" "}
              <span className="font-medium tabular-nums">
                {formatCurrency(Math.abs(shortfall.endBalance))}
              </span>
              , mesmo sem gastar nada além disso até lá. O que faltar passa para o ciclo
              seguinte.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Um ciclo por coluna: para cima o que fica livre (turquesa), para
          baixo o que vai faltar (coral) — positivo e negativo em torno do
          zero. A coluna é o link para o ciclo, e a selecionada leva o valor. */}
      <Card>
        <CardContent className="flex flex-col gap-4 py-5">
          <div className="flex items-baseline justify-between gap-3">
            <SectionLabel>Próximos ciclos</SectionLabel>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2.5 rounded-[3px] bg-chart-2" />
                Livre
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2.5 rounded-[3px] bg-chart-3" />
                Vai faltar
              </span>
            </div>
          </div>
          <ColumnChart
            title="Livre para gastar ou falta, por ciclo"
            height={180}
            columns={timeline.map((item) => {
              const short = item.endBalance < -0.005;
              const value = short ? item.endBalance : item.freeToSpend;
              return {
                key: String(item.offset),
                label: item.offset === 0 ? "Atual" : monthLabel(item.periodStart),
                value,
                valueLabel: formatCurrency(value),
                tone: short ? "negative" : "positive",
                detail: `${periodLabel(item)} · ${short ? "vai faltar" : "livre"}`,
                href: forecastHref(item.offset),
                selected: item.offset === offset,
              };
            })}
          />
        </CardContent>
      </Card>

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
                <div className="flex flex-col gap-2">
                  {entries.map((entry) => (
                    <EntryRow
                      key={`${entry.kind}-${entry.sourceId}-${entry.date.toISOString()}`}
                      entry={entry}
                      incoming={incoming}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
