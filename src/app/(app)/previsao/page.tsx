import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
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

/**
 * Os grupos das listas, cada um de um lado. Um resgate já feito é um depósito
 * negativo (`jar` < 0): ele mora do lado das entradas, com o valor virado,
 * para os subtotais somarem exatamente os chips do hero.
 */
const GROUPS: {
  key: string;
  kind: ForecastEntryKind;
  label: string;
  incoming: boolean;
  pick?: (entry: ForecastEntry) => boolean;
}[] = [
  { key: "income", kind: "income", label: "Entradas previstas", incoming: true },
  { key: "jarReturn", kind: "jarReturn", label: "Voltam das caixinhas", incoming: true },
  {
    key: "jarOut",
    kind: "jar",
    label: "Resgatado das caixinhas",
    incoming: true,
    pick: (entry) => entry.amount < 0,
  },
  { key: "fixedExpense", kind: "fixedExpense", label: "Despesas fixas", incoming: false },
  { key: "cardBill", kind: "cardBill", label: "Faturas", incoming: false },
  { key: "scheduled", kind: "scheduled", label: "Agendados", incoming: false },
  {
    key: "jarIn",
    kind: "jar",
    label: "Guardado em caixinhas",
    incoming: false,
    pick: (entry) => entry.amount >= 0,
  },
];

/**
 * No ciclo corrente as movimentações em sua maioria já aconteceram, e chamar
 * de "agendado" um almoço de duas semanas atrás — ou de "previsto" um salário
 * confirmado — seria mentir sobre o que a lista mostra. À frente, são de fato
 * previsões e agendamentos.
 */
function groupLabel(kind: ForecastEntryKind, label: string, offset: number) {
  if (offset !== 0) return label;
  if (kind === "scheduled") return "Lançamentos";
  // Não "Entradas": é o nome do chip do hero, que soma também as caixinhas.
  if (kind === "income") return "Rendas e recebimentos";
  return label;
}

/** Onde cada linha é editada: a previsão lê, e a linha leva até quem decide. */
function entryHref(entry: ForecastEntry) {
  switch (entry.kind) {
    case "fixedExpense":
      return "/rendas?aba=despesas";
    case "income":
      return "/rendas";
    case "cardBill":
      return `/cartoes/${entry.sourceId}`;
    case "jar":
    case "jarReturn":
      return "/caixinhas";
    case "scheduled":
      return "/historico";
  }
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
/** "Aluguel, Internet e Condomínio". */
function listJoin(items: string[]) {
  return items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

function offsetCaption(offset: number) {
  if (offset === 0) return "Ciclo atual";
  if (offset === 1) return "Próximo ciclo";
  return `Daqui a ${offset} ciclos`;
}

/**
 * Dentro de "Guardado em caixinhas", "Guardado em Nubank turbo" repete o
 * grupo e corta no celular: a linha leva só o nome da caixinha.
 */
function rowTitle(entry: ForecastEntry) {
  if (entry.kind !== "jar" && entry.kind !== "jarReturn") return entry.label;
  return entry.label.replace(/^(Guardado em|Resgate de) /, "");
}

function EntryRow({
  entry,
  incoming,
  index,
  current,
}: {
  entry: ForecastEntry;
  incoming: boolean;
  index: number;
  /** No ciclo corrente, passado e futuro se misturam: cada linha diz o seu. */
  current: boolean;
}) {
  // Uma ocorrência que pode estar só projetada (renda, conta, fatura, resgate
  // agendado) diz se já aconteceu, com a palavra do seu lado.
  const projectable = entry.kind !== "scheduled" && entry.kind !== "jar";
  const status = !projectable
    ? null
    : entry.confirmed
      ? entry.kind === "income"
        ? "recebido"
        : entry.kind === "jarReturn"
          ? "resgatado"
          : "pago"
      : current && !entry.awaiting
        ? incoming
          ? "previsto"
          : "a pagar"
        : null;
  const detail = [
    formatDate(entry.date),
    // Só onde existe o contrário: um lançamento é sempre um registro real. À
    // frente, tudo é previsão, e só o que já foi pago ganha palavra.
    status,
    // "Ainda aberta" lia como "não paga": é a fatura que ainda recebe compras.
    entry.partial && "aberta, pode crescer",
    entry.deferredIn && `inclui ${formatCurrency(entry.deferredIn)} adiados`,
    // Mostrado mas fora da conta, como na Início: um salário que ninguém disse
    // ter chegado não pode virar saldo.
    entry.awaiting && "aguardando confirmação, fora da conta",
  ]
    .filter(Boolean)
    .join(" · ");
  // A direção é a do grupo (um resgate já feito, depósito negativo, fica no
  // grupo das entradas); o sinal vem daqui, uma vez só, sobre o valor
  // absoluto — senão a linha dizia "−-R$ 2.000,00".
  const inflow = incoming;

  return (
    <li className="rise-in" style={stagger(index, 80, 45)}>
      {/* A linha leva para onde ela é editada: planejar no computador é
          também poder mexer no que pesa. */}
      <Link
        href={entryHref(entry)}
        className="group/entry block rounded-[18px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&>div]:transition-colors [&>div]:duration-150 hover:[&>div]:bg-card-hover"
      >
        <ListRow
          icon={inflow ? <ArrowDownLeft /> : <ArrowUpRight />}
          tone={inflow ? "positive" : "negative"}
          title={rowTitle(entry)}
          subtitle={<span className="tabular-nums">{detail}</span>}
          value={`${inflow ? "+" : "−"}${formatCurrency(Math.abs(entry.amount))}`}
          valueClassName={cn(
            inflow ? "text-positive" : "text-foreground",
            entry.awaiting && "text-muted-foreground line-through",
          )}
          trailing={
            <ChevronRight
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground/60 transition-transform duration-150 group-hover/entry:translate-x-0.5"
            />
          }
        />
      </Link>
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
  const paceByCycle = pace ? paceAcrossCycles(pace, periods) : null;
  const paceLeft = paceByCycle ? paceByCycle[offset] : null;
  // O que chega ao ciclo da tela vindo do anterior, no ritmo: só uma falta
  // herdada merece a frase "o que faltar antes passa para ele".
  const prevCycle = offset > 0 ? periods[offset - 1] : null;
  // A falta do anterior que a previsão já desconta (sem gastar mais).
  const prevBase = prevCycle
    ? Math.min(0, isNegativeCycle(prevCycle) ? prevCycle.endBalance : prevCycle.freeToSpend)
    : 0;
  const carryIn = paceByCycle && prevCycle ? paceByCycle[offset - 1] - prevBase : 0;
  const carriesShortfall = carryIn < -0.005;
  // O par: no ritmo, a sobra de antes passa adiante (o hero a conta como
  // gasta). Sem dizer, a conta do card não fecha de cabeça.
  const carriesSurplus = Math.max(0, carryIn);
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
  // Com o ciclo atual no vermelho, o número de hoje é zero (a Início diz isso):
  // um alvo que valesse desde amanhã mandaria gastar o salário antes de ele
  // cair. Aí o alvo só começa no próximo ciclo, supondo que o atual pare onde
  // está, e se divide só pelos dias dos ciclos à frente.
  const futureDays = periods.slice(1, offset + 1).reduce((sum, p) => sum + p.totalDays, 0);
  const targetFromNext =
    pace && paceLeft !== null && offset > 0 && isNegativeCycle(current) && futureDays > 0
      ? Math.max(
          0,
          Math.floor(
            (pace.perDay + (paceLeft + pace.perDay * pace.remainingDays) / futureDays) * 100,
          ) / 100,
        )
      : null;
  // Os chips do hero fecham com o "Saldo do ciclo": as entradas levam o que
  // volta das caixinhas, e um resgate já feito (depósito negativo) conta como
  // entrada, não como saída menor.
  // As despesas fixas que caem mais de uma vez neste ciclo.
  const billCounts = new Map<string, number>();
  for (const entry of period.entries)
    if (entry.kind === "fixedExpense")
      billCounts.set(entry.label, (billCounts.get(entry.label) ?? 0) + 1);
  const doubledBills = [...billCounts].filter(([, n]) => n > 1).map(([label]) => label);
  const jarIn = period.entries
    .filter((entry) => entry.kind === "jar" && entry.amount < 0)
    .reduce((sum, entry) => sum - entry.amount, 0);
  const incomingTotal = period.incomeTotal + period.jarReturnTotal + jarIn;
  // O que foi guardado e voltou dentro do mesmo ciclo: o menor dos dois lados.
  const jarRoundTrip = Math.min(period.jarTotal + jarIn, period.jarReturnTotal + jarIn);
  // As listas por grupo, com o subtotal positivo dos dois lados (o sinal é o
  // lado). Um agendado que só espera confirmação não entra na conta.
  const groupLists = GROUPS.map((group) => {
    const picked = period.entries.filter(
      (entry) => entry.kind === group.kind && (group.pick?.(entry) ?? true),
    );
    // No ciclo atual, o que ainda vai acontecer vem antes: é o que pesa, e
    // não pode ficar atrás do "Mostrar mais", embaixo do que já foi pago.
    // Os lançamentos do ciclo atual já aconteceram: o mais recente primeiro,
    // que é o que se procura.
    const entries =
      period.offset !== 0
        ? picked
        : group.kind === "scheduled"
          ? [...picked].reverse()
          : [...picked.filter((e) => !e.confirmed), ...picked.filter((e) => e.confirmed)];
    const subtotal = Math.abs(
      entries.filter((entry) => !entry.awaiting).reduce((sum, entry) => sum + entry.amount, 0),
    );
    // No ciclo atual, o que ainda vai acontecer é o número que decide.
    const pending =
      period.offset === 0 && group.kind !== "scheduled" && group.kind !== "jar"
        ? Math.abs(
            entries
              .filter((entry) => !entry.confirmed && !entry.awaiting)
              .reduce((sum, entry) => sum + entry.amount, 0),
          )
        : 0;
    // Tudo já aconteceu: o cabeçalho diz, como diz o "a pagar".
    const settled =
      period.offset === 0 &&
      group.kind !== "jar" &&
      group.kind !== "scheduled" &&
      entries.every((entry) => entry.confirmed);
    return { ...group, entries, subtotal, pending, settled };
  }).filter((group) => group.entries.length > 0);
  const summaryReconciles =
    Math.abs(
      groupLists.reduce((sum, g) => sum + (g.incoming ? g.subtotal : -g.subtotal), 0) -
        period.periodResult,
    ) < 0.01;
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
      ? period.offset === 1
        ? // O anterior é o corrente, que nem terminou: "faltou" seria passado.
          period.inherited < -0.005
          ? // O número de cima parte daqui: sem dizer que supõe parar de
            // gastar agora, ele promete mais do que o ritmo entrega.
            "Falta do ciclo atual, sem gastar mais"
          : "Guardado do ciclo atual"
        : period.inherited < -0.005
          ? "Faltou nos ciclos anteriores"
          : "Guardado dos ciclos anteriores"
      : budget.openingSource === "account"
        ? period.inherited < -0.005
          ? "Faltava na conta"
          : "Já estava na conta"
        : "Veio dos ciclos anteriores";

  // Os subtotais somados até o "Saldo do ciclo" do hero. Só aparece quando a
  // soma bate: uma conta que não fecha seria pior que nenhuma.
  const showSummary = summaryReconciles && groupLists.length > 1;
  const summaryLedger = (
    <dl className="flex flex-col gap-1.5">
      {groupLists.map((group) => (
        <div key={group.key} className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{groupLabel(group.kind, group.label, period.offset)}</dt>
          <dd className="shrink-0">
            {group.incoming ? "+" : "−"}
            {formatCurrency(group.subtotal)}
          </dd>
        </div>
      ))}
      <div className="mt-1 flex justify-between gap-3 border-t border-border pt-2 font-semibold">
        <dt>Saldo do ciclo</dt>
        <dd>{formatCurrency(period.periodResult)}</dd>
      </div>
      {/* Até o número do topo, com as mesmas linhas da fita do hero. */}
      {Math.abs(period.inherited) >= 0.005 && (
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{inheritedLabel}</dt>
          <dd className="shrink-0">{formatCurrency(period.inherited)}</dd>
        </div>
      )}
      {period.reservedForLater > 0.005 && (
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Guardado para cobrir ciclos à frente</dt>
          <dd className="shrink-0">−{formatCurrency(period.reservedForLater)}</dd>
        </div>
      )}
      {(Math.abs(period.inherited) >= 0.005 || period.reservedForLater > 0.005) && (
        <div className="mt-1 flex justify-between gap-3 border-t border-border pt-2 font-semibold">
          <dt>{isNegative ? "Vai faltar" : "Livre para gastar"}</dt>
          <dd className={isNegative ? "text-negative" : undefined}>
            {formatCurrency(isNegative ? Math.abs(period.endBalance) : period.freeToSpend)}
          </dd>
        </div>
      )}
    </dl>
  );

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
        currentHref={offset >= 2 ? forecastHref(0) : null}
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
                {/* Um título: navegando por títulos, o leitor de tela chega ao
                    número principal, e não só a "Ciclo a ciclo". */}
                <h2 className="flex items-center gap-1.5 text-sm font-medium text-(--hero-muted)">
                  {/* A cor não pode ser o único sinal do vermelho; o texto diz o resto. */}
                  {isNegative && (
                    <TriangleAlert aria-hidden className="size-4 shrink-0 text-negative" />
                  )}
                  {isNegative
                    ? `Vai faltar ${inCycle(period, currentYear)}`
                    : isTight
                      ? `Pouco livre para gastar ${inCycle(period, currentYear)}`
                      : `Livre para gastar ${inCycle(period, currentYear)}`}
                </h2>
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
                  ? `${period.daysLeft} ${period.daysLeft === 1 ? "dia restante" : "dias restantes"}, com hoje`
                  : `${period.totalDays} ${period.totalDays === 1 ? "dia" : "dias"} de ciclo`}
              </p>
              {/* Um ciclo comprido (o pagamento atrasou, o mês virou duas
                  vezes) pega a mesma conta duas vezes: é a causa mais comum
                  de um ciclo que falta, e sem a frase parece erro. */}
              {doubledBills.length > 0 && (
                <p className="text-[13px] text-(--hero-muted)">
                  Ciclo de {period.totalDays} dias: {listJoin(doubledBills)}{" "}
                  {doubledBills.length === 1 ? "cai" : "caem"} duas vezes.
                </p>
              )}
              {/* O ciclo atual no vermelho: as saídas aqui mesmo, no hero. */}
              {heroExits && exitLinks(heroExits)}
              {/* Uma coluna nos celulares estreitos: são os números a conferir,
                  e cortados não se conferem. */}
              <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
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
              {/* Guardar e resgatar no mesmo ciclo passa pelos dois chips: a
                  soma está certa, mas "entrou 15 mil" com renda de 10 assusta
                  sem a nota. */}
              {jarRoundTrip > 0.005 && (
                <p className="text-[12.5px] text-(--hero-muted) tabular-nums">
                  Os dois incluem {formatCurrency(jarRoundTrip)} que vão e voltam das caixinhas neste ciclo.
                </p>
              )}
            </div>

            {/* A conta por trás do número grande, como uma fita: o que veio de
                antes, mais o que este ciclo movimenta, menos o que ele guarda
                para a frente. Sem ela, um mês com renda maior que as contas
                aparecer negativo — ou menor do que parece — parece erro. O
                divisor é a mesma sombra de 1px do hero da Início. */}
            <dl className="flex flex-col gap-2.5 p-[18px] text-[13.5px] tabular-nums shadow-[-1px_-1px_0_0_var(--hero-line)] lg:p-5">
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
              , mesmo sem gastar mais nada.{" "}
              {/* Visto de um ciclo à frente, "o ciclo seguinte" seria o de
                  depois da tela: aqui a falta já chegou. */}
              {shortfall.offset < period.offset
                ? "Essa falta já está descontada neste ciclo."
                : "O que faltar passa para o ciclo seguinte."}
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
              {period.offset === 0
                ? ""
                : `, até o fim do ciclo de ${cycleMonth(period, currentYear)}`}
            </p>
            {/* 20px, e não o tamanho de um segundo hero: é uma projeção, e o
                número da tela é o de cima. O coral fica na palavra que diz o
                lado, não no valor: um segundo número vermelho competiria com o
                hero. */}
            <p className="font-heading text-[20px] leading-none font-bold tracking-[-0.025em] tabular-nums">
              {formatCurrency(Math.abs(paceLeft))}{" "}
              <span className="text-[15px] font-semibold tracking-normal text-muted-foreground">
                <span className={paceLeft < -0.005 ? "text-negative" : undefined}>
                  {paceLeft < -0.005 ? "faltando" : "sobrando"}
                </span>{" "}
                <span className="whitespace-nowrap">em {dateIn(lastDay(period), currentYear)}</span>
              </span>
            </p>
            {/* Duas frases curtas: o ritmo, e só quando falta, a saída. O ritmo
                é sempre o de agora, mesmo com um ciclo à frente na tela. */}
            {/* De onde vem o ritmo, e o que ele leva: sem a origem, o valor
                por dia é um número solto. */}
            <p className="text-[13.5px] leading-relaxed text-muted-foreground tabular-nums">
              {`É a média do ciclo atual (${formatCurrency(pace.spent)} em ${pace.elapsedDays} ${pace.elapsedDays === 1 ? "dia" : "dias"}, na conta e no cartão)`}
              {period.offset === 0
                ? pace.remainingDays > 0
                  ? `: saem mais ${formatCurrency(pace.projectedSpending)} nos ${pace.remainingDays} ${pace.remainingDays === 1 ? "dia" : "dias"} depois de hoje (hoje já entra na média).`
                  : "."
                : `: os ${period.totalDays} dias do ciclo de ${cycleMonth(period, currentYear)} levam ${formatCurrency(pace.perDay * period.totalDays)}${carriesShortfall ? `, e os ${formatCurrency(-carryIn)} a mais que faltarem antes, nesse ritmo, passam para ele${prevBase < -0.005 ? ` (os ${formatCurrency(-prevBase)} de falta sem gastar já estão na conta de cima)` : ""}` : carriesSurplus > 0.005 ? `, somando ${formatCurrency(carriesSurplus)} que sobram ${offset === 1 ? "do ciclo atual" : "dos ciclos antes"}, se cada sobra for passando adiante nesse ritmo` : ""}.`}
            </p>
            {paceLeft < -0.005 && (noSpendLeft < -0.005 || paceDays > 0) && (
              <p className="text-[13.5px] leading-relaxed text-muted-foreground tabular-nums">
                {noSpendLeft < -0.005
                  ? period.offset === 0
                    ? // O valor já é o número do hero: aqui, só a causa.
                      "Não é o dia a dia: mesmo sem gastar nada, são as contas que não cabem."
                    : `Mesmo sem gastar nada no dia a dia, faltariam ${formatCurrency(-noSpendLeft)}: são as contas que não cabem.`
                  : targetFromNext !== null
                    ? // O ciclo atual já fecha no vermelho: o número de hoje é
                      // zero, então o alvo só vale do próximo ciclo em diante.
                      `Para fechar, não gaste mais nada no ciclo atual e, a partir de ${dateIn(periods[1].periodStart, currentYear)}, até ${formatCurrency(Math.abs(targetFromNext - periods[1].dailyAvailable) < 0.01 ? periods[1].dailyAvailable : targetFromNext)} por dia.`
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
                  {timelineShort.length === 1 ? "ciclos fecha com falta:" : "ciclos fecham com falta · pior"}{" "}
                  {/* O pior ciclo é um link: dá para ir direto a ele. */}
                  {timelineWorst.offset === offset ? (
                    // Já é a tela aberta: um link para ela mesma não leva a nada.
                    <span className="font-semibold text-negative">
                      <span className="whitespace-nowrap">
                        este ({formatCurrency(Math.abs(timelineWorst.endBalance))})
                      </span>
                    </span>
                  ) : (
                    <Link
                      href={forecastHref(timelineWorst.offset)}
                      className={cn(shortfallLink, "font-semibold text-negative")}
                    >
                      {inNamedCycle(timelineWorst, currentYear)} (falta{" "}
                      {formatCurrency(Math.abs(timelineWorst.endBalance))})
                    </Link>
                  )}
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
          {/* No ciclo atual as saídas vêm antes, no HTML e na tela empilhada:
              o que já foi recebido não decide nada, e o que falta pagar
              decide. No xl, cada lado volta à sua coluna. */}
          {(period.offset === 0 ? [false, true] : [true, false]).map((side) => (
            <div
              key={String(side)}
              // A coluna das entradas é a curta: ela acompanha a rolagem, com
              // o resumo do ciclo embaixo, em vez de deixar um vão ao lado das
              // saídas.
              className={cn(
                "flex flex-col gap-6 xl:row-start-1",
                side ? "xl:sticky xl:top-6 xl:col-start-1" : "xl:col-start-2",
              )}
            >
              {groupLists
                .filter((group) => group.incoming === side)
                .map((group) => (
                  <div key={group.key} className="flex flex-col gap-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <SectionLabel>{groupLabel(group.kind, group.label, period.offset)}</SectionLabel>
                      <span className="text-right text-[13px] font-medium text-muted-foreground tabular-nums">
                        {group.pending > 0.005 && group.pending < group.subtotal - 0.005 ? (
                          <>
                            <span className="font-semibold text-foreground">
                              {formatCurrency(group.pending)}
                            </span>{" "}
                            de {formatCurrency(group.subtotal)} {group.incoming ? "a receber" : "a pagar"}
                          </>
                        ) : group.settled ? (
                          `${formatCurrency(group.subtotal)} · ${group.incoming ? "tudo recebido" : "tudo pago"}`
                        ) : (
                          formatCurrency(group.subtotal)
                        )}
                      </span>
                    </div>
                    {/* Um ciclo pode ter dezenas de lançamentos: as primeiras
                        linhas, e o resto num toque. */}
                    <CollapsibleList
                      className="flex flex-col gap-2"
                      items={group.entries.map((entry, index) => (
                        <EntryRow
                          key={`${entry.kind}-${entry.sourceId}-${entry.date.toISOString()}`}
                          entry={entry}
                          incoming={group.incoming}
                          index={index}
                          current={period.offset === 0}
                        />
                      ))}
                    />
                  </div>
                ))}
              {side && showSummary && (
                <div className="hidden flex-col gap-2 rounded-[18px] p-4 text-[13.5px] tabular-nums ring-1 ring-border xl:flex">
                  <SectionLabel>Resumo do ciclo</SectionLabel>
                  {summaryLedger}
                </div>
              )}
            </div>
          ))}
          {/* Abaixo do xl as colunas se empilham: o resumo vem depois das
              duas, fechado, para conferir os chips sem somar de cabeça. */}
          {showSummary && (
            <details className="group/sum rounded-[18px] p-4 text-[13.5px] tabular-nums ring-1 ring-border xl:hidden">
              <summary className="-my-2.5 flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-medium select-none [&::-webkit-details-marker]:hidden">
                Como chega a esse número
                <ChevronDown
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open/sum:rotate-180"
                />
              </summary>
              <div className="mt-3">{summaryLedger}</div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
