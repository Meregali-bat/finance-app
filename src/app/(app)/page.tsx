import { differenceInCalendarDays } from "date-fns";
import { ChevronRight, CreditCard, Receipt } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { deferralTargetDate, fallsOnDay, type OpeningSource } from "@/lib/period";
import { cumulativeDailySpending } from "@/lib/spending-trend";
import { AreaTrend } from "@/components/charts/area-trend";
import { loadBudgetInputs, registeredMovementOf } from "@/lib/budget-inputs";
import { formatCurrency, formatDate, installmentLabel } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionLabel } from "@/components/page-header";
import { CountUpCurrency } from "@/components/ui/animated-number";
import { DayRuler } from "@/components/day-ruler";
import { Logo } from "@/components/logo";
import { ThemeCycleButton } from "@/components/theme-toggle";
import { currentTheme } from "@/lib/theme-server";
import { MovementFormDialog } from "@/components/forms/movement-form-dialog";
import { toMovementValues } from "@/lib/history-item";
import { markCardBillPaid, markFixedExpensePaid } from "@/lib/actions/expense-payment";
import { deferFixedExpense } from "@/lib/actions/expense";
import { PeriodCloseCheck } from "@/components/period-close-check";
import { AccountBalanceCard } from "@/components/account-balance-card";
import { PurchaseSimulationDialog } from "@/components/forms/purchase-simulation-dialog";
import { HomeReminders, type HomeReminder } from "@/components/home-reminders";
import { homeCard } from "@/components/home-card";
import { SubtitleParts } from "@/components/list-row";
import { HomeDebts } from "@/components/home-debts";
import { loadDebts } from "@/lib/loans-data";
import { todayBudget } from "@/lib/today-budget";
import { PushSetup } from "@/components/push-setup";
import { HomeSlicesCard } from "@/components/home-slices-card";
import { loadSlicesOverview } from "@/lib/slices-data";

/**
 * O que o período herdou, dito do jeito que a pessoa leria.
 *
 * Com o saldo em conta, a herança é o dinheiro que já estava na conta — a
 * sobra de todos os meses e o que havia antes do app —, e chamá-la de "sobra
 * do período anterior" seria dizer outra coisa. Aí a legenda só diz de onde o
 * número parte.
 */
function openingCaption(opening: number, source: OpeningSource) {
  if (source === "account") return "a partir do seu saldo em conta";
  if (Math.abs(opening) < 0.005) return null;
  return opening > 0
    ? `inclui ${formatCurrency(opening)} dos períodos anteriores`
    : `desconta ${formatCurrency(Math.abs(opening))} que faltaram antes`;
}

/** "Quinta-feira" e "16 de outubro": o cabeçalho do desktop. */
function longHeading(date: Date) {
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(date);
  const day = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
  }).format(date);
  return { weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1), day };
}

/** "Qui, 16 de out.": o topo do celular, ao lado do logo. */
function shortHeading(date: Date) {
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "short" })
    .format(date)
    .replace(".", "");
  const day = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "short",
  }).format(date);
  return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)}, ${day}`;
}

/** O atraso de entrada de cada seção, lido pelo `.rise-in` do globals.css. */
function rise(ms: number) {
  return { "--rise-delay": `${ms}ms` } as React.CSSProperties;
}

/** "19:05": a hora do cadastro, no fuso do servidor (o do app). */
const clock = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});

export default async function DashboardPage() {
  const userId = await requireUserId();
  const today = new Date();

  const [inputs, categories, theme] = await Promise.all([
    loadBudgetInputs(userId),
    prisma.category.findMany({
      where: { userId, active: true },
      orderBy: { name: "asc" },
    }),
    currentTheme(),
  ]);
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  // As compras no cartão de hoje e de amanhã, com o que a lista precisa
  // mostrar (as entradas do orçamento só guardam valor e data). Datas de
  // calendário ficam em meia-noite UTC: a janela vai de hoje a depois de amanhã.
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const [debts, recentCardPurchases, slicesOverview] = await Promise.all([
    loadDebts(userId, today),
    prisma.cardPurchase.findMany({
      where: {
        userId,
        card: { deletedAt: null },
        date: { gte: new Date(todayUtc), lt: new Date(todayUtc + 2 * 86_400_000) },
      },
      select: {
        id: true,
        description: true,
        amount: true,
        date: true,
        createdAt: true,
        installments: true,
        categoryId: true,
        cardId: true,
      },
    }),
    loadSlicesOverview(userId, today),
  ]);

  const { accountBalance, budget, dailyAvailable, reservedForLater, savings } = todayBudget(
    inputs,
    today,
  );
  const registeredMovement = registeredMovementOf(inputs, today);
  const transactions = inputs.transactions.filter((t) => !t.fromPeriodClose);

  const totalDays = differenceInCalendarDays(budget.periodEnd, budget.periodStart);
  const elapsedDays = totalDays - budget.daysRemaining + 1;

  const spendingTrend = cumulativeDailySpending({
    start: budget.periodStart,
    today,
    transactions,
    cardPurchases: inputs.cardPurchases,
  }).map((point) => ({
    label: formatDate(point.day),
    value: point.total,
    valueLabel: formatCurrency(point.total),
  }));

  // `fallsOnDay`, e não uma comparação de meia-noite local dos dois lados:
  // `Transaction.date` guarda um dia de calendário na parte UTC, e lê-lo no
  // fuso local trazia o lançamento de amanhã para "hoje" e escondia o de hoje.
  // O card de resumo acima já lia certo, então as duas metades da tela
  // discordavam.
  //
  // O dia junta os lançamentos da conta e as compras no cartão, do mais
  // recente para o mais antigo: é o "o que eu fiz hoje", não o que saiu do
  // saldo — a compra no cartão vai para a fatura, e o resumo diz isso.
  const dayItems = (day: Date): DayItem[] =>
    [
      ...transactions
        .filter((t) => fallsOnDay(t.date, day))
        .map((t) => ({ ...t, kind: "transaction" as const })),
      ...recentCardPurchases
        .filter((p) => fallsOnDay(p.date, day))
        .map((p) => ({ ...p, amount: Number(p.amount), kind: "card" as const })),
    ].sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  const todaysItems = dayItems(today);
  const tomorrowsItems = dayItems(tomorrow);
  const todaySummary = [
    {
      label: "na conta",
      total: sumWhere(todaysItems, (i) => i.kind === "transaction" && i.amount > 0),
    },
    { label: "no cartão", total: sumWhere(todaysItems, (i) => i.kind === "card") },
  ]
    .filter((part) => part.total >= 0.005)
    .map((part) => `${formatCurrency(part.total)} ${part.label}`)
    .join(" · ");

  const isOverBudget = dailyAvailable < 0;
  // Zero porque a reserva de guardar levou o que sobrava, e não porque você
  // gastou demais: a frase tem que dizer isso, senão parece bronca.
  const allToSavings = !isOverBudget && dailyAvailable < 0.005 && (savings?.applied ?? 0) > 0.005;

  const cardOptions = inputs.creditCards
    .filter((c) => c.active)
    .map((c) => ({ id: c.id, name: c.name }));
  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name }));

  // Com os inativos: uma fatura de cartão desativado ou uma despesa encerrada
  // ainda podem ter um lembrete em aberto, e ele precisa de nome.
  const cardNameById = new Map(inputs.creditCards.map((c) => [c.id, c.name]));
  const expenseLabelById = new Map(inputs.fixedExpenses.map((e) => [e.id, e.label]));
  const incomeLabelById = new Map(inputs.incomes.map((i) => [i.id, i.label]));
  const caption = openingCaption(budget.openingBalance, budget.openingSource);

  const expenseById = new Map(inputs.fixedExpenses.map((e) => [e.id, e]));
  // Os destinos possíveis do "Adiar", calculados pela mesma função que a
  // action usa para gravar — o diálogo mostra a data exata.
  const deferOptions = (expenseId: string, dueDate: Date) => {
    const expense = expenseById.get(expenseId);
    if (!expense || expense.dueDay == null) return null;
    return {
      action: deferFixedExpense.bind(null, expenseId),
      nextMonthTarget: deferralTargetDate(expense, dueDate, "nextMonth"),
      endTarget:
        expense.installmentCount != null ? deferralTargetDate(expense, dueDate, "end") : null,
    };
  };

  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
  const heading = longHeading(today);

  const reminders: HomeReminder[] = [
    ...budget.cardBillReminders.map((bill) => ({
      kind: "due" as const,
      key: `card-${bill.cardId}-${bill.dueDate.toISOString()}`,
      label: `Fatura do ${cardNameById.get(bill.cardId) ?? "cartão"}`,
      amount: bill.amount,
      dueDate: bill.dueDate,
      overdue: bill.overdue ?? false,
      payAction: markCardBillPaid.bind(null, bill.cardId),
      cards: undefined,
      defer: null,
      deferredIn: 0,
      allowPartial: true,
      paidSoFar: bill.paidSoFar ?? 0,
    })),
    ...budget.fixedExpenseReminders.map((exp) => ({
      kind: "due" as const,
      key: `expense-${exp.expenseId}-${exp.dueDate.toISOString()}`,
      label: expenseLabelById.get(exp.expenseId) ?? "Despesa fixa",
      amount: exp.amount,
      dueDate: exp.dueDate,
      overdue: exp.overdue ?? false,
      payAction: markFixedExpensePaid.bind(null, exp.expenseId),
      cards: cardOptions,
      // Com parcial já pago, adiar levaria a ocorrência inteira — e o que já
      // saiu dela deixaria de contar.
      defer: exp.paidSoFar ? null : deferOptions(exp.expenseId, exp.dueDate),
      deferredIn: exp.deferredIn ?? 0,
      allowPartial: true,
      paidSoFar: exp.paidSoFar ?? 0,
    })),
    ...budget.incomeReminders.map((inc) => ({
      kind: "income" as const,
      key: `income-${inc.incomeId}-${inc.dueDate.toISOString()}`,
      label: incomeLabelById.get(inc.incomeId) ?? "Receita fixa",
      amount: inc.amount,
      dueDate: inc.dueDate,
      overdue: false,
      incomeId: inc.incomeId,
    })),
  ]
    // `overdue` do cálculo marca o que ficou de um período anterior; para a
    // tela, uma conta deste período com a data já passada também venceu.
    .map((r) => ({
      ...r,
      overdue: r.kind === "due" && (r.overdue || differenceInCalendarDays(today, r.dueDate) > 0),
    }))
    .map((r) => ({
      ...r,
      detail: [
        r.kind === "due" && r.paidSoFar > 0
          ? `falta ${formatCurrency(r.amount)} (pago ${formatCurrency(r.paidSoFar)})`
          : formatCurrency(r.amount),
        `${r.kind === "income" ? "previsto em" : r.overdue ? "venceu em" : "vence em"} ${formatDate(r.dueDate)}`,
        r.kind === "due" && r.deferredIn > 0
          ? `inclui ${formatCurrency(r.deferredIn)} adiados`
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
    }))
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  const movementRows = (list: DayItem[], baseDelay: number) =>
    list.map((t, i) => (
      <li key={`${t.kind}-${t.id}`} className="rise-in" style={rise(baseDelay + i * 90)}>
        <MovementFormDialog
          movement={toMovementValues({
            id: t.id,
            kind: t.kind,
            description: t.description,
            amount: t.amount,
            date: t.date,
            categoryId: t.categoryId,
            ...(t.kind === "card" ? { cardId: t.cardId, installments: t.installments } : {}),
          })}
          cards={cardOptions}
          categories={categoryOptions}
        >
          <div
            className={homeCard(
              "group/row flex cursor-pointer items-center gap-3 py-3 pr-3.5 pl-3 transition-[transform,background-color,box-shadow] duration-150 ease-out-quint hover:-translate-y-0.5 hover:bg-card-hover hover:shadow-(--shadow-card-hover) active:scale-[0.99] lg:py-3 lg:pr-3.5 lg:pl-3",
            )}
          >
            <div className="flex size-[38px] shrink-0 items-center justify-center rounded-xl bg-muted text-primary">
              {t.kind === "card" ? (
                <CreditCard className="size-[18px]" aria-hidden="true" />
              ) : (
                <Receipt className="size-[18px]" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold">{t.description}</p>
              <p className="text-[13px] text-muted-foreground">
                <SubtitleParts
                  text={[
                    t.createdAt && clock.format(t.createdAt),
                    t.kind === "card" && `no ${cardNameById.get(t.cardId) ?? "cartão"}`,
                    t.kind === "card" && installmentLabel(t.amount, t.installments),
                    (t.categoryId && categoryNameById.get(t.categoryId)) || "Sem categoria",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                />
              </p>
            </div>
            {/* Receita é negativa no banco; na tela, positiva e em turquesa. */}
            <span
              className={`shrink-0 text-[15px] font-semibold tabular-nums ${
                t.amount < 0 ? "text-positive" : ""
              }`}
            >
              {t.amount < 0 ? `+${formatCurrency(-t.amount)}` : formatCurrency(t.amount)}
            </span>
            <ChevronRight
              className="size-4 shrink-0 text-muted-foreground/60 transition-transform duration-150 group-hover/row:translate-x-0.5"
              aria-hidden="true"
            />
          </div>
        </MovementFormDialog>
      </li>
    ));

  return (
    <div className="relative flex flex-col gap-5 lg:gap-6">
      <PeriodCloseCheck />

      {/* Celular: o logo no topo, já que a barra lateral não existe ali. */}
      <header className="rise-in flex items-center justify-between gap-4 lg:hidden" style={rise(0)}>
        <Logo size="sm" />
        <div className="-mr-2.5 flex items-center gap-1">
          <p className="text-[13px] font-medium text-muted-foreground">{shortHeading(today)}</p>
          <ThemeCycleButton initial={theme} />
        </div>
      </header>
      <header className="rise-in hidden items-end justify-between gap-4 lg:flex" style={rise(0)}>
        <div className="flex flex-col gap-1.5">
          <p className="text-[13px] font-medium text-muted-foreground">{heading.weekday}</p>
          <h1 className="font-heading text-[34px] leading-none font-bold tracking-[-0.035em]">
            {heading.day}
          </h1>
        </div>
      </header>

      {/* Fora de `lg` o botão é fixo no canto da viewport, logo acima da
          barra inferior; em `lg` ele sobe para o cabeçalho, alinhado ao
          título. */}
      <div className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+74px)] z-20 lg:absolute lg:top-1.5 lg:right-0 lg:bottom-auto lg:z-auto">
        <MovementFormDialog cards={cardOptions} categories={categoryOptions} />
      </div>

      {/* O card de destaque. As duas colunas usam `auto-fit`: lado a lado
          quando cabem, empilhadas quando não. O divisor é uma sombra de 1px no
          canto superior esquerdo da segunda coluna, então vira vertical ou
          horizontal sozinho — o `overflow-hidden` corta a metade que sobra. */}
      <section
        aria-label="Orçamento de hoje"
        className="hero-surface rise-in relative overflow-hidden rounded-[26px] lg:rounded-[28px]"
        style={rise(80)}
      >
        <div className="relative z-10 p-1 lg:px-4 lg:py-3">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] overflow-hidden">
            <div className="flex flex-col gap-5 p-[18px] lg:p-5">
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium text-(--hero-muted)">
                  {isOverBudget
                    ? "Você já estourou o orçamento de hoje"
                    : allToSavings
                      ? "Hoje, o que sobra vai para guardar"
                      : "Você pode gastar hoje"}
                </p>
                <CountUpCurrency
                  value={dailyAvailable}
                  split
                  duration={1.3}
                  delay={0.25}
                  className={`flex items-baseline font-heading text-[64px] leading-[0.9] font-bold tracking-[-0.045em] tabular-nums lg:text-[80px] ${
                    isOverBudget ? "text-negative" : "text-(--hero-fg)"
                  }`}
                  symbolClassName="mr-1.5 text-[24px] tracking-[-0.02em] opacity-70 lg:mr-2 lg:text-[30px]"
                  centsClassName="text-[30px] tracking-[-0.03em] opacity-70 lg:text-[36px]"
                />
              </div>

              <div className="flex flex-col gap-2">
                <DayRuler totalDays={totalDays} elapsedDays={elapsedDays} />
                <div className="flex justify-between text-xs font-medium text-(--hero-muted) tabular-nums">
                  <span>
                    Dia {Math.max(1, elapsedDays)} de {Math.max(1, totalDays)}
                  </span>
                  <span>
                    {budget.daysRemaining}{" "}
                    {budget.daysRemaining === 1 ? "dia até receber" : "dias até receber"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                {[
                  {
                    label: "Saldo do período",
                    value: formatCurrency(budget.periodBalance),
                  },
                  { label: "Recebe em", value: formatDate(budget.periodEnd) },
                ].map((chip) => (
                  <div
                    key={chip.label}
                    className="flex min-w-0 flex-col gap-0.5 rounded-[14px] bg-(--hero-chip) px-3.5 py-2.5 ring-1 ring-(--hero-line) sm:rounded-2xl sm:px-4"
                  >
                    <span className="truncate text-[12.5px] font-medium text-(--hero-muted)">
                      {chip.label}
                    </span>
                    <span className="truncate text-[15px] font-semibold tabular-nums">
                      {chip.value}
                    </span>
                  </div>
                ))}
              </div>
              {(caption || reservedForLater > 0.005 || savings) && (
                <div className="flex flex-col gap-0.5 text-xs text-(--hero-muted)">
                  {caption && <p>{caption}</p>}
                  {reservedForLater > 0.005 && (
                    <p>
                      já contando {formatCurrency(reservedForLater)} que vão faltar mais à frente
                    </p>
                  )}
                  {savings && savings.applied > 0.005 && (
                    <p>separando {formatCurrency(savings.applied)} para guardar nas caixinhas</p>
                  )}
                  {savings && savings.shortfall > 0.005 && (
                    <p>
                      este período não fecha com tudo guardado: faltam{" "}
                      {formatCurrency(savings.shortfall)}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* O ritmo do período: quanto do dia a dia (lançamentos e compras no
              cartão) já saiu, dia a dia. Uma série só, então sem legenda — o
              título diz o que é. */}
            <div className="flex flex-col justify-end gap-3 p-[18px] shadow-[-1px_-1px_0_0_var(--hero-line)] lg:p-5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm text-(--hero-muted)">Gasto no período</p>
                <CountUpCurrency
                  value={spendingTrend.at(-1)?.value ?? 0}
                  duration={1.5}
                  delay={0.5}
                  className="font-heading text-[22px] leading-none font-bold tracking-[-0.035em] tabular-nums"
                />
              </div>
              <AreaTrend
                points={spendingTrend}
                height={96}
                className="h-16 lg:h-24"
                stroke="var(--hero-chart)"
                ring="var(--hero-dot-ring)"
                reveal
                title="Gasto acumulado no período"
              />
              <div className="hidden justify-between text-[11px] text-(--hero-faint) tabular-nums lg:flex">
                <span>{spendingTrend[0]?.label}</span>
                <span>hoje</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div
        className="rise-in grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-2.5 lg:gap-4"
        style={rise(200)}
      >
        <AccountBalanceCard
          balance={accountBalance}
          adjustedAt={inputs.account.adjustment?.createdAt ?? null}
          registeredMovement={registeredMovement}
        />

        {/* Sem cartão não há o que simular: a compra parcelada entra como uma
            compra de cartão para usar o fechamento e o vencimento de verdade,
            e um botão cuja única resposta possível é "cadastre um cartão" é
            ruído. */}
        {cardOptions.length > 0 && (
          <div className={homeCard("flex items-center justify-between gap-4")}>
            <div className="flex min-w-0 flex-col gap-1.5">
              <SectionLabel>Posso comprar isso?</SectionLabel>
              <p className="text-sm text-muted-foreground">
                Simule uma compra no cartão e veja se ela cabe nos próximos ciclos.
              </p>
            </div>
            <PurchaseSimulationDialog cards={cardOptions} categories={categoryOptions} />
          </div>
        )}

        <HomeSlicesCard
          configured={slicesOverview.configured}
          usage={slicesOverview.usage}
          savings={slicesOverview.savings}
        />
      </div>

      {/* As duas listas lado a lado quando cabem 340px cada; `items-start`
          impede que a coluna mais curta estique até a altura da outra. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] items-start gap-6">
        <div className="rise-in" style={rise(300)}>
          <div className="flex flex-col gap-6">
            <HomeReminders reminders={reminders} />
            <HomeDebts debts={debts} />
          </div>
        </div>

        <div className="rise-in flex flex-col gap-6" style={rise(380)}>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <SectionLabel>Movimentações de hoje</SectionLabel>
              {todaySummary && (
                <p className="text-[13px] text-muted-foreground tabular-nums">{todaySummary}</p>
              )}
            </div>
            {todaysItems.length === 0 ? (
              <EmptyState
                icon={Receipt}
                text="Nenhuma movimentação lançada hoje ainda."
                hint="Use o + para lançar a primeira."
              />
            ) : (
              <ul className="flex flex-col gap-2.5">{movementRows(todaysItems, 520)}</ul>
            )}
          </div>

          {tomorrowsItems.length > 0 && (
            <div className="flex flex-col gap-3">
              <SectionLabel>Amanhã</SectionLabel>
              <ul className="flex flex-col gap-2.5">
                {movementRows(tomorrowsItems, 520 + todaysItems.length * 90)}
              </ul>
            </div>
          )}

          {process.env.VAPID_PUBLIC_KEY && <PushSetup publicKey={process.env.VAPID_PUBLIC_KEY} />}
        </div>
      </div>
    </div>
  );
}

/** Uma linha do dia: um lançamento da conta ou uma compra no cartão. */
type DayItem = {
  id: string;
  description: string;
  amount: number;
  date: Date;
  createdAt: Date | null;
  categoryId: string | null;
} & ({ kind: "transaction" } | { kind: "card"; cardId: string; installments: number });

function sumWhere(items: DayItem[], keep: (item: DayItem) => boolean): number {
  return items.filter(keep).reduce((sum, item) => sum + item.amount, 0);
}
