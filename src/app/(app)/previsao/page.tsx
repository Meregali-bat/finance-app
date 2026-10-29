import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  Gauge,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
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
import { buttonVariants } from "@/components/ui/button";
import { PageHeader, SectionLabel } from "@/components/page-header";
import { CountUpCurrency } from "@/components/ui/animated-number";
import { IconSquare, ListRow, stagger } from "@/components/list-row";
import { homeCard } from "@/components/home-card";
import { ForecastNav } from "@/components/forecast-nav";
import { LineChart, type LinePoint } from "@/components/charts/line-chart";
import { CollapsibleList } from "@/components/collapsible-list";
import { cn } from "@/lib/utils";
import { TIGHT_SHARE } from "@/lib/hero-tone";
import { paceAcrossCycles, spendingPace } from "@/lib/spending-pace";

/**
 * Quantos ciclos o gráfico mostra abaixo de `lg`: mais que isso, as colunas
 * ficam estreitas demais para o polegar. A partir de `lg` vão todos os ciclos
 * que a navegação alcança.
 */
const NARROW_TIMELINE_LENGTH = 9;

/**
 * A janela estreita do gráfico: começa no ciclo atual e só anda quando o ciclo
 * da tela sairia dela. Andando, ele fica na penúltima coluna — com o vizinho
 * da direita à vista, e o fim do horizonte encostado na borda.
 */
function narrowWindowStart(offset: number, total: number) {
  return Math.min(
    Math.max(0, offset - (NARROW_TIMELINE_LENGTH - 2)),
    Math.max(0, total - NARROW_TIMELINE_LENGTH),
  );
}

/** "out", "nov" — o mês em que o ciclo começa, sem o ponto da abreviação. */
function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", "");
}

const GROUPS: { kind: ForecastEntryKind; label: string; incoming: boolean }[] = [
  { kind: "income", label: "Entradas previstas", incoming: true },
  { kind: "jarReturn", label: "Voltam das caixinhas", incoming: true },
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

/**
 * "no ciclo atual", "em nov", "em out de 2027" — um ciclo depois de uma
 * preposição, com a contração certa e o ano quando é outro.
 */
function inNamedCycle(period: PeriodForecast, currentYear: number) {
  return period.offset === 0 ? "no ciclo atual" : `em ${cycleMonth(period, currentYear)}`;
}

/**
 * "nov", "nov de 2027" — o nome de um ciclo numa frase. O ano entra quando não
 * é o do ciclo atual: com 13 ciclos à frente, o mesmo mês aparece duas vezes.
 */
function cycleMonth(period: PeriodForecast, currentYear: number) {
  const month = monthLabel(period.periodStart);
  const year = period.periodStart.getFullYear();
  return year === currentYear ? month : `${month} de ${year}`;
}

/** "14 de nov.", "14 de nov. de 2027": o ano só fora do ano do ciclo atual. */
function dateIn(date: Date, currentYear: number) {
  return date.getFullYear() === currentYear
    ? formatDate(date)
    : `${formatDate(date)} de ${date.getFullYear()}`;
}

/** "neste ciclo", "no ciclo de nov" — de qual ciclo a tela está falando. */
function inCycle(period: PeriodForecast, currentYear: number) {
  return period.offset === 0 ? "neste ciclo" : `no ciclo de ${cycleMonth(period, currentYear)}`;
}

/** Os links de saída do aviso de falta: sublinhados, na cor do texto. */
const shortfallLink =
  "w-fit rounded-sm underline decoration-current/40 underline-offset-4 transition-colors duration-150 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function forecastHref(offset: number) {
  return `/previsao?p=${offset}`;
}

/** O ciclo fecha no vermelho mesmo sem gastar nada além do comprometido. */
function isNegativeCycle(period: PeriodForecast) {
  return period.endBalance < -0.005;
}

/** O último dia de dentro do ciclo — `periodEnd` é o primeiro de fora. */
function lastDay(period: PeriodForecast) {
  const day = new Date(period.periodEnd);
  day.setDate(day.getDate() - 1);
  return day;
}

/**
 * "15 de nov. – 14 de dez.", "15 de out. – 14 de nov. de 2027": o ano uma vez,
 * no fim, quando o ciclo não é deste ano; nas duas pontas, se elas são de
 * anos diferentes e a primeira também não é deste.
 */
function periodLabel(period: PeriodForecast, currentYear: number) {
  const end = lastDay(period);
  const startYear = period.periodStart.getFullYear();
  const start =
    startYear !== currentYear && startYear !== end.getFullYear()
      ? dateIn(period.periodStart, currentYear)
      : formatDate(period.periodStart);
  return `${start} – ${dateIn(end, currentYear)}`;
}

/** Onde o ciclo está em relação a hoje, dito em palavras. */
function offsetCaption(offset: number) {
  if (offset === 0) return "Ciclo atual";
  if (offset === 1) return "Próximo ciclo";
  return `Daqui a ${offset} ciclos`;
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
    entry.partial && "ainda aberta",
    entry.deferredIn && `inclui ${formatCurrency(entry.deferredIn)} adiados`,
    // Mostrado mas fora da conta, como na Início: um salário que ninguém disse
    // ter chegado não pode virar saldo.
    entry.awaiting && "aguardando confirmação, fora da conta",
  ]
    .filter(Boolean)
    .join(" · ");
  // Um valor negativo num grupo inverte a direção: um resgate já feito mora
  // entre os "guardados" com valor negativo, e é dinheiro que entrou. O sinal
  // vem daqui, uma vez só — senão a linha dizia "−-R$ 2.000,00".
  const inflow = incoming !== entry.amount < 0;

  return (
    <li className="rise-in" style={stagger(index, 80, 45)}>
      <ListRow
        icon={inflow ? <ArrowDownLeft /> : <ArrowUpRight />}
        tone={inflow ? "positive" : "negative"}
        title={entry.label}
        subtitle={<span className="tabular-nums">{detail}</span>}
        value={`${inflow ? "+" : "−"}${formatCurrency(Math.abs(entry.amount))}`}
        valueClassName={cn(
          inflow ? "text-positive" : "text-foreground",
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
        <PageHeader
          title="Previsão"
          subtitle="Quanto cada ciclo pode gastar"
        />
        <EmptyState
          icon={CalendarClock}
          text="Sem uma renda fixa cadastrada não dá para saber onde um ciclo começa e o outro termina."
          action={
            <Link href="/rendas" className={buttonVariants()}>
              Cadastrar renda
            </Link>
          }
        />
      </div>
    );
  }

  const period = periods[offset];
  // "Se continuar gastando assim": o ritmo do ciclo corrente, levado até o
  // ciclo que está na tela — a sobra ou a falta de cada um passa adiante.
  const current = periods[0];
  const currentYear = current.periodStart.getFullYear();
  const pace = spendingPace({
    periodStart: current.periodStart,
    daysLeft: current.daysLeft,
    freeToSpend: isNegativeCycle(current) ? current.endBalance : current.freeToSpend,
    today,
    transactions: inputs.transactions,
    cardPurchases: inputs.cardPurchases,
  });
  const paceLeft = pace ? paceAcrossCycles(pace, periods)[offset] : null;
  // O mesmo caminho sem gasto nenhum no dia a dia: quando ele já falta, cortar
  // o dia a dia não fecha a conta, e dizer "gaste R$ X a menos" mentiria.
  const noSpendLeft = pace
    ? paceAcrossCycles(
        {
          perDay: 0,
          projectedLeft: isNegativeCycle(current) ? current.endBalance : current.freeToSpend,
        },
        periods,
      )[offset]
    : 0;
  // Os dias daqui até o fim do ciclo da tela, para dividir uma falta por eles.
  const paceDays = pace
    ? pace.remainingDays + periods.slice(1, offset + 1).reduce((sum, p) => sum + p.totalDays, 0)
    : 0;
  // O alvo diário que fecha a conta, no lugar de "X a menos por dia": o
  // ritmo de hoje menos o corte, arredondado para baixo no centavo.
  const paceTarget =
    pace && paceLeft !== null && paceDays > 0
      ? Math.max(0, Math.floor((pace.perDay + paceLeft / paceDays) * 100) / 100)
      : 0;
  // Os chips do hero fecham com o "Saldo do ciclo": as entradas levam o que
  // volta das caixinhas, e um resgate já feito (depósito negativo) conta como
  // entrada, não como saída menor.
  const jarIn = period.entries
    .filter((entry) => entry.kind === "jar" && entry.amount < 0)
    .reduce((sum, entry) => sum - entry.amount, 0);
  const incomingTotal = period.incomeTotal + period.jarReturnTotal + jarIn;
  const outgoingTotal =
    period.fixedExpenseTotal +
    period.cardBillTotal +
    period.scheduledTotal +
    period.jarTotal +
    jarIn;
  const isNegative = period.endBalance < -0.005;
  // O tom do hero, o mesmo sistema da Início (`data-tone`). O vermelho é o
  // ciclo da tela que fecha negativo. O apertado não sai de `heroTone`: ele
  // mede o número do dia contra o gasto do período e de hoje, e um ciclo à
  // frente não tem gasto — a conta se reduz ao próprio número e nunca diz
  // "apertado". Aqui a régua é a renda do ciclo: positivo, mas com menos de
  // `TIGHT_SHARE` dela livre para o dia a dia depois das contas e da reserva.
  const isTight =
    !isNegative &&
    period.expectedIncomeTotal > 0.005 &&
    period.freeToSpend < period.expectedIncomeTotal * TIGHT_SHARE;
  // A frase do gráfico fala de todos os ciclos, mesmo os que a janela estreita
  // do celular deixa de fora: um "todos fecham positivos" que ignorasse os
  // últimos quatro mentiria.
  const timeline = periods;
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

  // Os pontos do gráfico, para uma faixa de ciclos. O ano entra na primeira
  // coluna quando ela não é deste ano (a janela andou) e em toda virada.
  const chartPoints = (list: PeriodForecast[]): LinePoint[] =>
    list.map((item, index) => {
      const short = item.endBalance < -0.005;
      const value = short ? item.endBalance : item.freeToSpend;
      const year = item.periodStart.getFullYear();
      const previousYear = index > 0 ? list[index - 1].periodStart.getFullYear() : currentYear;
      return {
        key: String(item.offset),
        label: item.offset === 0 ? "Agora" : monthLabel(item.periodStart),
        sublabel: previousYear !== year ? String(year) : undefined,
        value,
        valueLabel: formatCurrency(value),
        compactLabel: formatCompactCurrency(value),
        detail: `${periodLabel(item, currentYear)} · ${short ? "vai faltar" : "livre"}`,
        href: forecastHref(item.offset),
        selected: item.offset === offset,
      };
    });
  const windowStart = narrowWindowStart(offset, periods.length);
  const narrowTimeline = periods.slice(windowStart, windowStart + NARROW_TIMELINE_LENGTH);

  // O aviso de falta aponta para um ciclo que não é o da tela — esse o hero já
  // diz. Primeiro o atual: na abertura a tela está no próximo, e um ciclo atual
  // no vermelho é o mais urgente de todos. Senão, o primeiro à frente da tela
  // que fecha no vermelho mesmo guardando tudo o que dá: é nos ciclos até ele
  // que dá para economizar para cobrir.
  // O do ciclo atual só até o próximo: repetido igual em todos os doze ciclos
  // à frente, ele virava paisagem.
  const shortfall =
    offset === 1 && isNegativeCycle(current)
      ? current
      : (periods.find((item) => item.offset > offset && isNegativeCycle(item)) ?? null);
  // No próprio ciclo atual no vermelho o aviso não aparece (o hero já diz),
  // mas as saídas sim: é o estado mais urgente.
  const heroExits = offset === 0 && isNegative ? current : null;
  // A saída do aviso: o adiar de verdade mora nos lembretes da Início, e só
  // vale para o ciclo atual; à frente, o que dá para mexer são as despesas
  // fixas (pausar, encerrar, mudar o valor). E, havendo dinheiro guardado, um
  // resgate.
  const hasJarBalance =
    shortfall || heroExits
      ? (await prisma.jar.count({ where: { userId, deletedAt: null, balance: { gt: 0 } } })) > 0
      : false;
  const exitLinks = (target: PeriodForecast) => (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-medium">
      {target.offset === 0 ? (
        <Link href="/#lembretes" className={cn(shortfallLink, "-my-2 inline-block py-2")}>
          Ver o que dá para adiar
        </Link>
      ) : (
        <Link href="/rendas?aba=despesas" className={cn(shortfallLink, "-my-2 inline-block py-2")}>
          Rever as despesas fixas
        </Link>
      )}
      {hasJarBalance && (
        <Link href="/caixinhas" className={cn(shortfallLink, "-my-2 inline-block py-2")}>
          Resgatar de uma caixinha
        </Link>
      )}
    </div>
  );

  const inheritedLabel =
    period.offset > 0
      ? period.inherited < -0.005
        ? "Faltou nos ciclos anteriores"
        : "Guardado dos ciclos anteriores"
      : budget.openingSource === "account"
        ? period.inherited < -0.005
          ? "Faltava na conta"
          : "Já estava na conta"
        : "Veio dos ciclos anteriores";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Previsão"
        subtitle="Quanto cada ciclo pode gastar"
      />

      <ForecastNav
        label={periodLabel(period, currentYear)}
        caption={offsetCaption(period.offset)}
        previousHref={offset > 0 ? forecastHref(offset - 1) : null}
        nextHref={offset < MAX_FORECAST_OFFSET ? forecastHref(offset + 1) : null}
      />

      <section
        aria-label="Este ciclo"
        className="hero-surface rise-in relative overflow-hidden rounded-[26px] lg:rounded-[28px]"
        data-tone={isNegative ? "negative" : isTight ? "tight" : undefined}
        style={{ "--rise-delay": "80ms" } as React.CSSProperties}
      >
        <div className="relative z-10 p-1 lg:px-4 lg:py-3">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] overflow-hidden">
            <div className="flex flex-col gap-4 p-[18px] lg:p-5">
              <div className="flex flex-col gap-1.5">
                <p className="flex items-center gap-1.5 text-sm font-medium text-(--hero-muted)">
                  {/* A cor não pode ser o único sinal do vermelho; o texto diz o resto. */}
                  {isNegative && (
                    <TriangleAlert aria-hidden className="size-4 shrink-0 text-negative" />
                  )}
                  {isNegative
                    ? `Vai faltar ${inCycle(period, currentYear)}`
                    : isTight
                      ? `Pouco livre para gastar ${inCycle(period, currentYear)}`
                      : `Livre para gastar ${inCycle(period, currentYear)}`}
                </p>
                {/* Mesmo elemento entre um ciclo e outro (trocar a query não
                    remonta a tela), então o valor conta do anterior até o novo.
                    A falta vai sem sinal, como no ritmo e no aviso: o rótulo e
                    o coral já dizem que é falta. */}
                <CountUpCurrency
                  value={isNegative ? Math.abs(period.endBalance) : period.freeToSpend}
                  className={cn(
                    "font-heading text-[44px] leading-none font-bold tracking-[-0.04em] tabular-nums lg:text-[52px]",
                    isNegative ? "text-negative" : "text-(--hero-fg)",
                  )}
                />
              </div>
              <p className="text-sm text-(--hero-muted) tabular-nums">
                {/* Num ciclo negativo `dailyAvailable` é o estouro por dia, e
                    "−R$ 40 por dia" não é um valor que dê para gastar. */}
                {isNegative ? (
                  <span className="font-semibold text-(--hero-fg)">Nada livre para gastar</span>
                ) : (
                  <>
                    <span className="font-semibold text-(--hero-fg)">
                      {formatCurrency(period.dailyAvailable)}
                    </span>{" "}
                    por dia
                  </>
                )}{" "}
                ·{" "}
                {period.offset === 0
                  ? `${period.daysLeft} ${period.daysLeft === 1 ? "dia restante" : "dias restantes"}`
                  : `${period.totalDays} ${period.totalDays === 1 ? "dia" : "dias"} de ciclo`}
              </p>
              {/* O ciclo atual no vermelho: as saídas aqui mesmo, no hero. */}
              {heroExits && exitLinks(heroExits)}
              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    label: "Entradas",
                    value: incomingTotal,
                    icon: (
                      <ArrowDownLeft className="size-4 shrink-0 text-positive" aria-hidden="true" />
                    ),
                  },
                  {
                    label: "Saídas",
                    value: outgoingTotal,
                    icon: (
                      <ArrowUpRight className="size-4 shrink-0 text-negative" aria-hidden="true" />
                    ),
                  },
                ].map((chip) => (
                  <div
                    key={chip.label}
                    className="flex min-w-0 items-center gap-2.5 rounded-2xl bg-(--hero-chip) px-3.5 py-2.5 ring-1 ring-(--hero-line)"
                  >
                    {chip.icon}
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-[12.5px] font-medium text-(--hero-muted)">
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
            <dl className="flex flex-col justify-center gap-2.5 p-[18px] text-[13.5px] tabular-nums shadow-[-1px_-1px_0_0_var(--hero-line)] lg:p-5">
              {/* Sem nada vindo de antes, a linha some: um "R$ 0,00" guardado
                  depois de um ciclo que fechou positivo parece erro (a
                  previsão conta a sobra como gasta). */}
              {Math.abs(period.inherited) >= 0.005 && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-(--hero-muted)">{inheritedLabel}</dt>
                  <dd className="font-medium">{formatCurrency(period.inherited)}</dd>
                </div>
              )}
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-(--hero-muted)">Saldo do ciclo</dt>
                <dd className="font-medium">{formatCurrency(period.periodResult)}</dd>
              </div>
              {period.reservedForLater > 0.005 && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-(--hero-muted)">Guardado para cobrir ciclos à frente</dt>
                  <dd className="font-medium">−{formatCurrency(period.reservedForLater)}</dd>
                </div>
              )}
              <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-(--hero-line) pt-3">
                <dt className="font-semibold">
                  {isNegative ? "Vai faltar" : "Livre para gastar"}
                </dt>
                <dd className="font-heading text-lg font-bold tracking-[-0.02em]">
                  {formatCurrency(isNegative ? Math.abs(period.endBalance) : period.freeToSpend)}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* O aviso vem antes do ritmo: é fato (as contas não cabem), e o
          ritmo é uma projeção. */}
      {shortfall && (
        <div
          className="rise-in flex items-start gap-3 rounded-[20px] bg-card p-3.5 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--negative)_30%,transparent)]"
          style={{ "--rise-delay": "140ms" } as React.CSSProperties}
        >
          <IconSquare tone="negative">
            <AlertTriangle />
          </IconSquare>
          <div className="flex flex-col gap-2 pt-1.5">
            <p className="text-[13.5px] leading-relaxed">
              {/* "Passa do que você tem", não "do que entra": a conta inclui o
                  que veio dos ciclos anteriores. */}
              {/* O ciclo atual pelo nome, e não "out": em out de 2027 na
                  tela, "no ciclo de out" lia como o da tela. */}
              {shortfall.offset === period.offset
                ? "Neste ciclo"
                : shortfall.offset === 0
                  ? "No ciclo atual"
                  : `No ciclo de ${cycleMonth(shortfall, currentYear)}`}
              , as contas passam do que você tem: faltam{" "}
              <span className="font-semibold tabular-nums">
                {formatCurrency(Math.abs(shortfall.endBalance))}
              </span>
              , mesmo sem gastar mais nada. O que faltar passa para o ciclo seguinte.
            </p>
            {/* As saídas: no ciclo atual, adiar uma conta (nos lembretes da
                Início); à frente, mexer nas despesas fixas; e, com dinheiro
                guardado, resgatar. */}
            {exitLinks(shortfall)}
          </div>
        </div>
      )}

      {pace && paceLeft !== null && (
        <section
          aria-label="No seu ritmo"
          className={homeCard("rise-in flex items-start gap-3")}
          style={{ "--rise-delay": "160ms" } as React.CSSProperties}
        >
          <IconSquare tone={paceLeft < -0.005 ? "negative" : "positive"}>
            <Gauge />
          </IconSquare>
          <div className="flex min-w-0 flex-col gap-1.5 pt-0.5">
            {/* Condicional, e com o ritmo no título: é um "e se", subordinado
                ao número de cima, e não um segundo número da tela. */}
            <p className="text-[13px] font-medium text-muted-foreground tabular-nums">
              Se continuar gastando{" "}
              <span className="whitespace-nowrap">{formatCurrency(pace.perDay)} por dia</span>
              {period.offset === 0 ? "" : `, até ${cycleMonth(period, currentYear)}`}
            </p>
            {/* 20px, e não o tamanho de um segundo hero: é uma projeção, e o
                número da tela é o de cima. */}
            <p className="font-heading text-[20px] leading-none font-bold tracking-[-0.025em] tabular-nums">
              <span className={paceLeft < -0.005 ? "text-negative" : undefined}>
                {formatCurrency(Math.abs(paceLeft))}
              </span>{" "}
              <span className="text-[15px] font-semibold tracking-normal text-muted-foreground">
                {paceLeft < -0.005 ? "faltando" : "sobrando"} em{" "}
                {dateIn(lastDay(period), currentYear)}
              </span>
            </p>
            {/* Duas frases curtas: o ritmo, e só quando falta, a saída. O ritmo
                é sempre o de agora, mesmo com um ciclo à frente na tela. */}
            {(period.offset > 0 || pace.remainingDays > 0) && (
              <p className="text-[13.5px] leading-relaxed text-muted-foreground tabular-nums">
                {period.offset === 0
                  ? `Nesse ritmo, saem mais ${formatCurrency(pace.projectedSpending)} até o fim do ciclo.`
                  : `Nesse ritmo, os ${period.totalDays} dias do ciclo de ${cycleMonth(period, currentYear)} levam ${formatCurrency(pace.perDay * period.totalDays)}, e o que faltar antes passa para ele.`}
              </p>
            )}
            {paceLeft < -0.005 && (noSpendLeft < -0.005 || paceDays > 0) && (
              <p className="text-[13.5px] leading-relaxed text-muted-foreground tabular-nums">
                {noSpendLeft < -0.005
                  ? `Mesmo sem gastar nada no dia a dia, faltariam ${formatCurrency(-noSpendLeft)}: são as contas que não cabem.`
                  : period.offset > 0 && paceTarget < period.dailyAvailable - 0.005
                    ? // Abaixo do número de cima: diz por quê, senão os dois
                      // números diários parecem se contradizer.
                      `Para fechar, gaste até ${formatCurrency(paceTarget)} por dia a partir de amanhã, menos que os ${formatCurrency(period.dailyAvailable)} de cima: o ritmo de agora faz o ciclo atual chegar devendo.`
                    : `Para fechar, gaste até ${formatCurrency(paceTarget)} por dia a partir de amanhã.`}
              </p>
            )}
          </div>
        </section>
      )}

      {/* Um ciclo por coluna: para cima o que fica livre (turquesa), para
          baixo o que vai faltar (coral) — positivo e negativo em torno do
          zero. Acima, a leitura do gráfico numa frase: quantos fecham com
          falta e qual é o pior, ou, sem nenhum, onde a folga é menor. */}
      <div
        className={homeCard("rise-in flex flex-col gap-5")}
        style={{ "--rise-delay": "220ms" } as React.CSSProperties}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="flex flex-col gap-1.5">
            <SectionLabel>Ciclo a ciclo</SectionLabel>
            <p className="text-[13.5px] text-muted-foreground tabular-nums">
              {timelineShort.length > 0 ? (
                <>
                  <span className="font-semibold text-foreground">
                    {timelineShort.length} dos {timeline.length}
                  </span>{" "}
                  {timelineShort.length === 1 ? "ciclos fecha" : "ciclos fecham"} com falta · pior{" "}
                  {/* O pior ciclo é um link: dá para ir direto a ele. */}
                  <Link
                    href={forecastHref(timelineWorst.offset)}
                    className={cn(shortfallLink, "font-semibold text-negative")}
                  >
                    {inNamedCycle(timelineWorst, currentYear)} (falta{" "}
                    {formatCurrency(Math.abs(timelineWorst.endBalance))})
                  </Link>
                </>
              ) : (
                <>
                  Todos os {timeline.length} ciclos fecham positivos · menor folga{" "}
                  <Link
                    href={forecastHref(timelineWorst.offset)}
                    className={cn(shortfallLink, "font-semibold text-foreground")}
                  >
                    {inNamedCycle(timelineWorst, currentYear)} (
                    {formatCurrency(timelineWorst.freeToSpend)})
                  </Link>
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
        {/* Abaixo de `lg`, a janela estreita, que segue o ciclo da tela; a
            partir de `lg`, todos os ciclos. Só um dos dois existe por tamanho
            (o outro é `display: none`), então o leitor de tela lê um gráfico. */}
        <div className="lg:hidden">
          <LineChart
            title="Livre para gastar ou falta, por ciclo"
            variant="polarity"
            valueLabels="all"
            height={190}
            points={chartPoints(narrowTimeline)}
          />
        </div>
        <div className="hidden lg:block">
          <LineChart
            title="Livre para gastar ou falta, por ciclo"
            variant="polarity"
            valueLabels="all"
            height={190}
            points={chartPoints(periods)}
          />
        </div>
      </div>

      {period.entries.length === 0 ? (
        <EmptyState
          icon={Wallet}
          text="Nada comprometido neste ciclo ainda."
          hint="Rendas, despesas fixas, faturas e lançamentos futuros aparecem aqui."
        />
      ) : (
        // Duas colunas a partir de `xl`: o que entra de um lado, o que sai do
        // outro — e não grupos em zigue-zague numa grade, com um vão embaixo
        // da coluna curta. Cada grupo leva o subtotal, para os chips do hero
        // serem conferíveis.
        <div className="flex flex-col gap-6 xl:grid xl:grid-cols-2 xl:items-start">
          {[true, false].map((side) => (
            <div key={String(side)} className="flex flex-col gap-6">
              {GROUPS.filter((group) => group.incoming === side).map(
                ({ kind, label, incoming }) => {
                  const entries = period.entries.filter((entry) => entry.kind === kind);
                  if (entries.length === 0) return null;
                  const subtotal = entries
                    .filter((entry) => !entry.awaiting)
                    .reduce((sum, entry) => sum + entry.amount, 0);
                  return (
                    <div key={kind} className="flex flex-col gap-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <SectionLabel>{groupLabel(kind, label, period.offset)}</SectionLabel>
                        <span className="text-[13px] font-medium text-muted-foreground tabular-nums">
                          {formatCurrency(Math.abs(subtotal))}
                        </span>
                      </div>
                      {/* Um ciclo pode ter dezenas de lançamentos: as primeiras
                          linhas, e o resto num toque. */}
                      <CollapsibleList
                        className="flex flex-col gap-2"
                        items={entries.map((entry, index) => (
                          <EntryRow
                            key={`${entry.kind}-${entry.sourceId}-${entry.date.toISOString()}`}
                            entry={entry}
                            incoming={incoming}
                            index={index}
                          />
                        ))}
                      />
                    </div>
                  );
                },
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
