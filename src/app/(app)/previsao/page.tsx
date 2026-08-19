import Link from "next/link";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CalendarClock, Wallet } from "lucide-react";
import { requireUserId } from "@/lib/auth-helpers";
import { loadBudgetInputs } from "@/lib/budget-inputs";
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
import { cn } from "@/lib/utils";

/** Quantos ciclos a faixa de tendência mostra, contando o corrente. */
const TIMELINE_LENGTH = 7;

const GROUPS: { kind: ForecastEntryKind; label: string; incoming: boolean }[] = [
  { kind: "income", label: "Entradas previstas", incoming: true },
  { kind: "fixedExpense", label: "Despesas fixas", incoming: false },
  { kind: "cardBill", label: "Faturas", incoming: false },
  { kind: "scheduled", label: "Agendados", incoming: false },
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
        incoming ? "before:bg-primary" : "before:bg-negative",
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
            {entry.confirmed && entry.kind !== "scheduled" && " · confirmado"}
            {entry.partial && " · fatura ainda aberta"}
          </p>
        </div>
        <p
          className={cn(
            "shrink-0 font-medium tabular-nums",
            incoming ? "text-primary" : "text-foreground",
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

  // Só o que está ativo: projetar uma renda ou despesa que o usuário desligou
  // seria prever dinheiro que ele já decidiu que não existe mais.
  const inputs = await loadBudgetInputs(userId, { activeOnly: true });

  // A faixa de tendência precisa dos primeiros ciclos mesmo quando a navegação
  // está lá na frente, e vice-versa — daí o maior dos dois.
  const periods = forecastPeriods({
    ...inputs,
    today,
    count: Math.max(offset, TIMELINE_LENGTH - 1),
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
  const isNegative = period.balance < 0;
  const timeline = periods.slice(0, TIMELINE_LENGTH);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Previsão" subtitle="O que já está comprometido nos próximos ciclos" />

      <ForecastNav
        label={periodLabel(period)}
        caption={offsetCaption(period.offset)}
        previousHref={offset > 0 ? forecastHref(offset - 1) : null}
        nextHref={offset < MAX_FORECAST_OFFSET ? forecastHref(offset + 1) : null}
      />

      <Card variant="elevated">
        {/* Empilhado até `xl` pelo mesmo motivo do Início: em `lg` a barra
            lateral come 240px e as três regiões ficariam estreitas demais. */}
        <CardContent className="flex flex-col gap-5 py-6 xl:grid xl:grid-cols-[1fr_1fr_16rem] xl:gap-8">
          <div className="flex flex-col gap-1 xl:justify-center">
            <p className="text-sm text-muted-foreground">
              {isNegative ? "Vai faltar neste período" : "Deve sobrar neste período"}
            </p>
            <AnimatedCurrency
              value={period.balance}
              className={cn(
                "font-heading text-[2.75rem] leading-[1.02] font-bold tracking-[-0.03em] tabular-nums lg:text-[3.25rem]",
                isNegative ? "text-negative" : "text-primary",
              )}
            />
          </div>

          <div className="flex flex-col justify-center gap-3 border-t border-border/60 pt-4 xl:border-t-0 xl:border-l xl:border-border/60 xl:pt-0 xl:pl-8">
            <div className="flex flex-col gap-1">
              <SectionLabel>Por dia</SectionLabel>
              <p className="font-medium tabular-nums">{formatCurrency(period.dailyAvailable)}</p>
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              {period.totalDays} {period.totalDays === 1 ? "dia" : "dias"} de{" "}
              {formatDate(period.periodStart)} a {formatDate(lastDay(period))}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-border/60 pt-4 xl:grid-cols-1 xl:content-center xl:gap-6 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-8">
            <div className="flex flex-col gap-1">
              <SectionLabel>Entradas</SectionLabel>
              <p className="flex items-center gap-1.5 font-medium tabular-nums">
                <ArrowDownLeft className="size-4 shrink-0 text-primary" aria-hidden="true" />
                {formatCurrency(period.incomeTotal)}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <SectionLabel>Saídas</SectionLabel>
              <p className="flex items-center gap-1.5 font-medium tabular-nums">
                <ArrowUpRight className="size-4 shrink-0 text-negative" aria-hidden="true" />
                {formatCurrency(
                  period.fixedExpenseTotal + period.cardBillTotal + period.scheduledTotal,
                )}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {isNegative && (
        <Card className="pl-1 before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-negative">
          <CardContent className="flex items-start gap-3 py-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-negative" aria-hidden="true" />
            <p className="text-sm">
              O que já está comprometido passa da renda prevista em{" "}
              <span className="font-medium tabular-nums">
                {formatCurrency(Math.abs(period.balance))}
              </span>
              . E isso ainda não inclui o gasto do dia a dia.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        <SectionLabel>Próximos ciclos</SectionLabel>
        {/* Rola na horizontal em vez de quebrar: sete cartões numa tela de
            celular viram uma coluna alta que esconde a tendência. */}
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
          {timeline.map((item) => (
            <Link
              key={item.offset}
              href={forecastHref(item.offset)}
              aria-current={item.offset === offset ? "page" : undefined}
              className={cn(
                "flex min-w-[8.5rem] shrink-0 flex-col gap-1 rounded-2xl px-4 py-3 shadow-surface ring-1 transition-colors",
                item.offset === offset
                  ? "bg-card-elevated ring-primary/40"
                  : "bg-card ring-foreground/10 hover:bg-muted",
              )}
            >
              <span className="text-[0.6875rem] font-medium tracking-[0.06em] text-muted-foreground uppercase">
                {item.offset === 0 ? "Atual" : formatDate(item.periodStart)}
              </span>
              <span
                className={cn(
                  "font-medium tabular-nums",
                  item.balance < 0 ? "text-negative" : "text-foreground",
                )}
              >
                {formatCurrency(item.balance)}
              </span>
            </Link>
          ))}
        </div>
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
