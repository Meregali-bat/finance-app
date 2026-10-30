import { differenceInCalendarDays } from "date-fns";
import Link from "next/link";
import { ChevronRight, CircleAlert, CreditCard, Receipt, TriangleAlert } from "lucide-react";
import { staleAdjustmentDays } from "@/lib/account-balance";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { deferralTargetDate, fallsOnDay, ownSpendingOf } from "@/lib/period";
import { cumulativeDailySpending } from "@/lib/spending-trend";
import { AreaTrend } from "@/components/charts/area-trend";
import { loadBudgetInputs, registeredMovementOf } from "@/lib/budget-inputs";
import { formatCurrency, formatDate, installmentLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionLabel } from "@/components/page-header";
import { CountUpCurrency } from "@/components/ui/animated-number";
import { DayRuler } from "@/components/day-ruler";
import { Logo } from "@/components/logo";
import { UserAvatar } from "@/components/user-avatar";
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
import { heroTone } from "@/lib/hero-tone";
import { tomorrowDaily } from "@/lib/tomorrow-daily";
import { PushSetup } from "@/components/push-setup";
import { HomeSlicesCard } from "@/components/home-slices-card";
import { loadSlicesOverview } from "@/lib/slices-data";
import { SLICES } from "@/lib/slices";
import { HomePlanLinks } from "@/components/home-plan-links";
import { ScrollAwayFab } from "@/components/scroll-away-fab";
import { BudgetBreakdown } from "@/components/budget-breakdown";

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

/**
 * O atraso de entrada de cada seção, lido pelo `.rise-in` do globals.css. A
 * Início é aberta várias vezes por dia para ler um número: a entrada inteira
 * (último atraso, 140ms, mais 260ms) acaba em ~400ms, e as linhas da lista
 * sobem com a coluna em vez de uma por uma. Os atrasos seguem a ordem de cima
 * para baixo, que é a do HTML nos dois tamanhos: cabeçalho 0, hero 40,
 * o dia 100, lembretes e ferramentas 120, o "a receber" e os avisos 140.
 */
function rise(ms: number) {
  return { "--rise-delay": `${ms}ms`, "--rise-duration": "260ms" } as React.CSSProperties;
}

/**
 * Os links do hero: o próximo passo no vermelho e o que fica de lado, na linha
 * da régua. O foco usa a tinta do hero: o anel do tema some no fundo escuro do
 * estado negativo.
 */
const heroLink =
  "w-fit rounded-sm text-(--hero-muted) underline underline-offset-4 transition-colors duration-150 hover:text-(--hero-fg) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--hero-fg)";

/** "19:05": a hora do cadastro, no fuso do servidor (o do app). */
const clock = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});

export default async function DashboardPage() {
  const userId = await requireUserId();
  const today = new Date();

  const [inputs, categories, profile] = await Promise.all([
    loadBudgetInputs(userId),
    prisma.category.findMany({
      where: { userId, active: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { name: true, email: true, avatar: true },
    }),
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
  const spentInPeriod = spendingTrend.at(-1)?.value ?? 0;

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
  const todayParts = [
    {
      label: "na conta",
      // O gasto seu: sem transferência para outra conta e sem a parte emprestada.
      total: todaysItems.reduce(
        (sum, i) => sum + (i.kind === "transaction" ? ownSpendingOf(i) : 0),
        0,
      ),
    },
    { label: "no cartão", total: sumWhere(todaysItems, (i) => i.kind === "card") },
  ];
  // O que já saiu hoje, na conta e no cartão: o mesmo total do resumo das
  // movimentações. O número do dia é uma média até o pagamento e já desconta
  // isso — sem este valor ao lado, ele parece o que ainda resta para hoje.
  const spentToday = todayParts
    .filter((part) => part.total >= 0.005)
    .reduce((sum, part) => sum + part.total, 0);
  const todaySummary = todayParts
    .filter((part) => part.total >= 0.005)
    .map((part) => `${formatCurrency(part.total)} ${part.label}`)
    .join(" · ");

  // Vermelho > tudo para guardar > apertado > normal; a regra está em
  // `heroTone`. O `allToSavings` é zero porque a reserva de guardar levou o
  // que sobrava, e não porque você gastou demais: a frase tem que dizer isso,
  // senão parece bronca. O apertado é um dia magro: o hero se acalma.
  const tone = heroTone({
    dailyAvailable,
    daysRemaining: budget.daysRemaining,
    totalDays,
    spentInPeriod,
    spentToday,
    savingsApplied: savings?.applied ?? 0,
  });
  const isOverBudget = tone === "negative";
  const allToSavings = tone === "allToSavings";
  const isTight = tone === "tight";
  // O número do dia negativo é o estouro do período inteiro dividido pelos
  // dias que faltam (o `dailyAvailable` do ciclo corrente da previsão, ou
  // `periodBalance / daysRemaining` sem renda): o período fecha no vermelho
  // mesmo sem gastar mais nada. Multiplicar de volta dá o tamanho do buraco.
  const periodDeficit = isOverBudget ? -dailyAvailable * budget.daysRemaining : 0;
  // O número de amanhã se hoje não sair mais nada; só o apertado usa.
  const tightTomorrow = isTight
    ? tomorrowDaily({ dailyAvailable, daysRemaining: budget.daysRemaining })
    : null;

  const cardOptions = inputs.creditCards
    .filter((c) => c.active)
    .map((c) => ({ id: c.id, name: c.name }));
  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name }));

  // Com os inativos: uma fatura de cartão desativado ou uma despesa encerrada
  // ainda podem ter um lembrete em aberto, e ele precisa de nome.
  const cardNameById = new Map(inputs.creditCards.map((c) => [c.id, c.name]));
  const expenseLabelById = new Map(inputs.fixedExpenses.map((e) => [e.id, e.label]));
  const incomeLabelById = new Map(inputs.incomes.map((i) => [i.id, i.label]));
  // O que distingue o app: o que o número do dia já deixa de lado para um
  // ciclo à frente que não se paga. Sem reserva, entra o que as fatias separam
  // para guardar. No desktop é um link curto ao lado do livre até receber; no
  // celular os dois só aparecem na conta do número.
  const savingsApplied = savings && savings.applied > 0.005 ? savings.applied : 0;
  const setAside =
    reservedForLater > 0.005
      ? { label: "reservado", amount: reservedForLater, href: "/previsao" }
      : savingsApplied > 0
        ? { label: "para guardar", amount: savingsApplied, href: "/metas" }
        : null;
  const savingsShortfall =
    savings && savings.shortfall > 0.005
      ? `Este período não fecha com tudo guardado: faltam ${formatCurrency(savings.shortfall)}.`
      : null;

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
  // No vermelho, o próximo passo: adiar uma conta, se alguma deixa; senão,
  // ver na previsão como ficam os próximos ciclos.
  const canDefer = reminders.some((r) => r.kind === "due" && r.defer != null);
  // Há quantos dias o saldo em conta, de onde o número parte, foi conferido;
  // nulo enquanto fresco (a mesma regra do card do saldo).
  const adjustedAt = inputs.account.adjustment?.createdAt ?? null;
  const staleDays =
    accountBalance != null && adjustedAt ? staleAdjustmentDays(adjustedAt, today) : null;

  // A curva do gasto fica sob a régua, cada ponto embaixo da barra do seu dia:
  // começa no centro da primeira barra e vai até o centro da de hoje. As contas
  // repetem as da régua: barras `flex-1` separadas por `--ruler-gap`, que o
  // bloco da régua define (2,5px; 3px no desktop) e as duas leem.
  const rulerDays = Math.max(1, totalDays);
  const trendSpan = Math.min(spendingTrend.length, rulerDays) - 1;

  // O resumo de cada linha do "Planejar" do celular.
  const slicesOver = slicesOverview.usage.filter(
    (u) => u.percentUsed > 100 && !SLICES.find((s) => s.key === u.key)?.saving,
  ).length;

  const movementRows = (list: DayItem[]) =>
    list.map((t) => (
      <li key={`${t.kind}-${t.id}`}>
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
          {/* Uma lista do dia, aberta várias vezes: o hover só muda o fundo,
              sem levantar a linha. */}
          <div
            className={homeCard(
              "group/row flex cursor-pointer items-center gap-3 py-3 pr-3.5 pl-3 transition-[transform,background-color] duration-150 ease-out-quint hover:bg-card-hover active:scale-[0.99] lg:py-3 lg:pr-3.5 lg:pl-3",
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
    // O respiro de baixo, só no celular: no fim da rolagem, o botão + (fixo,
    // 58px a 74px da base) não pode cobrir o "Pagar" nem o "Recebi" do último
    // card, que ficam na mesma borda direita.
    <div className="relative flex flex-col gap-5 pb-[calc(env(safe-area-inset-bottom)+3rem)] lg:gap-6 lg:pb-0">
      <PeriodCloseCheck />

      {/* Celular: o logo no topo, já que a barra lateral não existe ali. */}
      <header className="rise-in flex items-center justify-between gap-4 lg:hidden" style={rise(0)}>
        <Logo size="sm" />
        <div className="-mr-1 flex items-center gap-2">
          <p className="text-[13px] font-medium text-muted-foreground">{shortHeading(today)}</p>
          {/* O Perfil (nome, foto e tema) não tem lugar na barra inferior: entra pela foto. */}
          <Link
            href="/perfil"
            aria-label="Perfil e aparência"
            className="flex size-11 items-center justify-center rounded-full transition-transform duration-150 active:scale-[0.92]"
          >
            <UserAvatar
              name={profile.name}
              email={profile.email}
              src={profile.avatar}
              className="size-9"
            />
          </Link>
        </div>
      </header>
      <header className="rise-in hidden items-end justify-between gap-4 lg:flex" style={rise(0)}>
        <div className="flex flex-col gap-1.5">
          <p className="text-[13px] font-medium text-muted-foreground">{heading.weekday}</p>
          {/* Texto, não título: o h1 da página é a frase do hero, em todos os tamanhos. */}
          {/* 22px: um degrau acima dos títulos de seção (18px), e bem abaixo
              do número do hero — a data situa, não compete. */}
          <p className="font-heading text-[22px] leading-none font-bold tracking-[-0.03em]">
            {heading.day}
          </p>
        </div>
      </header>

      {/* Fora de `lg` o botão é fixo no canto da viewport, logo acima da
          barra inferior; em `lg` ele sobe para o cabeçalho, alinhado ao
          título. No celular ele recolhe ao rolar para baixo. */}
      <ScrollAwayFab className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+74px)] z-20 lg:absolute lg:top-1.5 lg:right-0 lg:bottom-auto lg:z-auto">
        <MovementFormDialog cards={cardOptions} categories={categoryOptions} shortcut="n" />
      </ScrollAwayFab>

      {/* O card de destaque. O número do dia é a única figura grande: à
          esquerda, ele, a régua do período e, sob ela, a curva do gasto, em
          tamanho de legenda (é o que já foi), e a linha do livre até
          receber. No desktop, a coluna da direita olha para a frente: as
          próximas contas e a conta do número. No celular as duas colunas
          empilham, na mesma ordem do HTML, e as contas somem — os lembretes
          vêm logo abaixo. */}
      <section
        aria-label="Orçamento de hoje"
        className="hero-surface rise-in relative overflow-hidden rounded-[26px] lg:rounded-[28px]"
        data-tone={isOverBudget ? "negative" : isTight ? "tight" : undefined}
        style={rise(40)}
      >
        <div className="relative z-10 p-1 lg:px-4 lg:py-3">
          <div className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-4 p-[18px] pb-0 lg:gap-5 lg:p-5">
              <div className="flex flex-col gap-2">
                {/* O título da página, em todos os tamanhos: a pergunta que o app responde. */}
                {/* O ícone fica fora do texto, e o texto num span só: com o
                    h1 em flex, cada pedaço virava uma coluna e o título se
                    partia no celular. */}
                <h1 className="flex items-start gap-1.5 text-sm font-medium text-(--hero-muted)">
                  {/* A cor não pode ser o único sinal do vermelho. */}
                  {isOverBudget && (
                    <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-negative" />
                  )}
                  <span>
                  {/* Com o saldo velho, o próprio título é condicional: é o
                      que se lê primeiro, e não pode afirmar um vermelho que
                      talvez não exista. */}
                  {isOverBudget
                    ? staleDays != null
                      ? <>
                          Pode estar no vermelho: saldo conferido{" "}
                          <span className="whitespace-nowrap">há {staleDays} dias</span>
                        </>
                      : "Este período está no vermelho"
                    : allToSavings
                      ? "Hoje, o que sobra vai para guardar"
                      : isTight
                        ? "Apertado até receber"
                        : "Por dia, até receber"}
                  {/* O número entra no título para o leitor de tela: a lista
                      de títulos e o "h" dizem a pergunta junto com a
                      resposta. O número grande abaixo fica só visual
                      (`announce={false}`), para não ser lido duas vezes. */}
                  {/* Com o título em frase, o ":" faria o valor ler como saldo. */}
                  <span className="sr-only">
                    {isOverBudget
                      ? `. Por dia: ${formatCurrency(dailyAvailable)}`
                      : `: ${formatCurrency(dailyAvailable)}`}
                  </span>
                  </span>
                </h1>
                {/* O número é por dia: a unidade fica colada nele, senão ele
                    lê como saldo. No estado normal ela já está no título logo
                    acima, e a linha de baixo só dá a data; nos outros três
                    (vermelho, tudo para guardar, apertado) o título diz o
                    estado, e a linha leva a unidade. */}
                <div className="flex flex-col gap-2">
                  <CountUpCurrency
                    value={dailyAvailable}
                    split
                    memoryKey="home:daily"
                    announce={false}
                    className={`flex items-baseline font-heading text-[64px] leading-[0.9] font-bold tracking-[-0.045em] tabular-nums lg:text-[80px] ${
                      isOverBudget && staleDays == null ? "text-negative" : "text-(--hero-fg)"
                    }`}
                    signClassName="mr-1 text-[44px] lg:text-[54px]"
                    symbolClassName="mr-1.5 text-[24px] tracking-[-0.02em] opacity-70 lg:mr-2 lg:text-[30px]"
                    centsClassName="text-[30px] tracking-[-0.03em] opacity-70 lg:text-[36px]"
                  />
                  <div className="flex flex-col gap-0.5">
                    <p className="text-[15px] font-medium text-(--hero-muted) tabular-nums">
                      {isOverBudget || allToSavings || isTight
                        ? `por dia até ${formatDate(budget.periodEnd)}`
                        : `Próximo pagamento em ${formatDate(budget.periodEnd)}`}
                      {/* No vermelho, no celular, a linha da régua some; os
                          dias que faltam vêm para cá, e a régua não fica muda. */}
                      {isOverBudget && (
                        <span className="lg:hidden">
                          {" · "}
                          {budget.daysRemaining === 1
                            ? "falta 1 dia"
                            : `faltam ${budget.daysRemaining} dias`}
                        </span>
                      )}
                    </p>
                    {/* Sem gasto hoje a linha some: o número já é a média pura.
                        Com gasto, ela diz que ele já saiu do número — senão o
                        número parece o que ainda resta para hoje, e a pessoa
                        desconta de novo de cabeça. */}
                    {/* "O que saiu", e não "você gastou": um empréstimo para
                        alguém também sai do número, e não é gasto. */}
                    {spentToday >= 0.005 && (
                      <p className="text-sm text-(--hero-muted) tabular-nums">
                        Já descontado o que saiu hoje:{" "}
                        <span className="font-semibold text-(--hero-fg)">
                          {formatCurrency(spentToday)}
                        </span>
                      </p>
                    )}
                    {/* O número parte do saldo em conta; com ele velho, o
                        aviso vem aqui, onde o número é lido — e não só no card
                        do saldo, abaixo da dobra. É a causa mais provável de um
                        vermelho que não é de verdade: no vermelho, ele vira
                        a própria frase do déficit, mais abaixo. */}
                    {staleDays != null && !isOverBudget && (
                      <p className="flex items-start gap-1 text-sm text-(--hero-muted) tabular-nums">
                        <CircleAlert
                          aria-hidden="true"
                          className="mt-[3px] size-3.5 shrink-0 text-(--hero-fg)"
                        />
                        <span>
                          Conta feita com o saldo conferido{" "}
                          <span className="whitespace-nowrap">
                            há {staleDays} dias ·{" "}
                            <a href="#saldo" className={heroLink}>
                              Conferir
                            </a>
                          </span>
                        </span>
                      </p>
                    )}
                  </div>
                </div>
                {/* No apertado, o que segurar hoje rende amanhã, em número: o
                    mesmo livre dividido por um dia a menos (`tomorrowDaily`).
                    Sem amanhã no período, ou com o número em zero, a frase
                    diz o que é verdade e acalma: o que está previsto até o
                    pagamento cabe (fora do vermelho, o período fecha em pé).
                    A data já está na unidade logo acima; aqui ela vira "lá". */}
                {isTight && (
                  <div className="flex flex-col gap-0.5 text-sm">
                    <p className="font-medium text-(--hero-fg) tabular-nums">
                      {tightTomorrow != null
                        ? `${spentToday >= 0.005 ? "Se hoje ficar só nisso" : "Se hoje passar sem gastos"}, amanhã sobe para ${formatCurrency(tightTomorrow)} por dia.`
                        : "As contas previstas até lá já estão cobertas."}
                    </p>
                    {canDefer && (
                      <a href="#lembretes" className={heroLink}>
                        Veja o que dá para adiar
                      </a>
                    )}
                  </div>
                )}
                {isOverBudget && (
                  <div className="flex flex-col gap-0.5 text-sm">
                    {/* A data já está na unidade acima; aqui vem o total do período. */}
                    {/* "Fecha no negativo", e não "faltam": o "faltam" da
                        linha da régua é de dias. É o único lugar do déficit;
                        no vermelho, a régua não repete o livre até receber.
                        Com o saldo velho, o déficit vira condicional e a
                        única saída é conferir o saldo: adiar uma conta por um
                        vermelho que pode não existir seria agir pela mentira. */}
                    <p className="font-medium text-(--hero-fg)">
                      {staleDays != null
                        ? `Se a estimativa estiver certa, o período fecha ${formatCurrency(periodDeficit)} no negativo.`
                        : `O período fecha ${formatCurrency(periodDeficit)} no negativo, mesmo sem gastar mais nada.`}
                    </p>
                    {/* Âncora nativa, não `Link`: o `hashchange` é o que faz os
                        lembretes abrirem por inteiro, para a conta adiável não
                        ficar escondida no "Mostrar mais". */}
                    {staleDays != null ? (
                      // A única ação desse estado: 44px de toque, sem mudar o desenho.
                      <a href="#saldo" className={cn(heroLink, "-my-3 inline-block w-fit py-3")}>
                        Conferir o saldo
                      </a>
                    ) : canDefer ? (
                      <a href="#lembretes" className={heroLink}>
                        Veja o que dá para adiar
                      </a>
                    ) : (
                      <Link href="/previsao" className={heroLink}>
                        Veja como ficam os próximos ciclos
                      </Link>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5 [--ruler-gap:2.5px] lg:[--ruler-gap:3px]">
                <DayRuler totalDays={totalDays} elapsedDays={elapsedDays} />
                {/* O gasto acumulado, dia a dia, embaixo das barras dos dias
                    que já passaram. Do primeiro dia não há curva: o gasto dele
                    está no "Já descontado o que saiu hoje" lá em cima. */}
                {trendSpan > 0 && (
                  <div
                    style={{
                      marginLeft: `calc((100% - ${rulerDays - 1} * var(--ruler-gap)) / ${rulerDays} / 2)`,
                      width: `calc(${trendSpan} * (100% + var(--ruler-gap)) / ${rulerDays})`,
                    }}
                  >
                    <AreaTrend
                      points={spendingTrend}
                      height={40}
                      className="h-7 lg:h-9"
                      stroke="var(--hero-chart)"
                      ring="var(--hero-dot-ring)"
                      reveal
                      title="Gasto acumulado no período"
                    />
                  </div>
                )}
                {/* A linha de olhar para a frente, embaixo dos dias apagados: o
                    livre até receber e quantos dias faltam — o divisor da
                    conta do número. No vermelho fica só o tempo: o total já
                    está na frase do déficit, acima. No desktop, à esquerda, embaixo da curva,
                    o total dela; e, ao lado do livre, o que o número deixa de
                    lado, como link. No celular os dois ficam na conta do
                    número, aberta só quando pedida: o hero leva um valor a
                    menos. A data do pagamento já está sob o número, e o dia de
                    hoje, na régua. */}
                {/* No vermelho, no celular, a linha teria só o "faltam N
                    dias", que repete a data da unidade: some, e o hero
                    encurta. No desktop fica, com o gasto do período. */}
                <div
                  className={`flex flex-wrap justify-between gap-x-3 gap-y-0.5 pt-0.5 text-xs font-medium text-(--hero-muted) tabular-nums ${
                    isOverBudget ? "max-lg:hidden" : ""
                  }`}
                >
                  <p className="hidden lg:block">
                    Gasto no período{" "}
                    <span className="font-semibold text-(--hero-fg)">
                      {formatCurrency(spentInPeriod)}
                    </span>
                  </p>
                  <p className="ml-auto text-right">
                    {/* Cada parte inteira: se não couber, quebra entre elas,
                        nunca no meio do valor. */}
                    {!isOverBudget && (
                      <>
                        <span className="whitespace-nowrap">
                          Livre até receber{" "}
                          <span
                            className={`font-semibold ${
                              budget.periodBalance < 0 ? "text-negative" : "text-(--hero-fg)"
                            }`}
                          >
                            {formatCurrency(budget.periodBalance)}
                          </span>
                          {" ·"}
                        </span>{" "}
                      </>
                    )}
                    <span className="whitespace-nowrap">
                      {budget.daysRemaining === 1
                        ? "falta 1 dia"
                        : `faltam ${budget.daysRemaining} dias`}
                    </span>
                    {setAside && (
                      <span className="hidden lg:inline">
                        {" · "}
                        <Link href={setAside.href} className={heroLink}>
                          <span className="font-semibold text-(--hero-fg)">
                            {formatCurrency(setAside.amount)}
                          </span>{" "}
                          {setAside.label}
                        </Link>
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* A coluna que explica o número. No desktop, o divisor é uma
                sombra de 1px à esquerda, e a conta vem aberta: há espaço, e as
                próximas contas que ficavam aqui repetiam os lembretes logo
                abaixo. No celular ela é um `<details>`, aberto só quando
                pedido. O aviso de falta fica fora dela — é aviso, não
                explicação. */}
            <div className="flex flex-col gap-1 p-[18px] text-[13px] leading-snug text-pretty lg:p-5 lg:shadow-[-1px_0_0_0_var(--hero-line)]">
              {savingsShortfall && (
                <p className="font-medium text-(--hero-fg)">{savingsShortfall}</p>
              )}
              <BudgetBreakdown
                budget={budget}
                accountBalance={accountBalance}
                accountBalanceStaleDays={staleDays}
                reservedForLater={reservedForLater}
                savingsApplied={savingsApplied}
                dailyAvailable={dailyAvailable}
                spentInPeriod={spentInPeriod}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Tudo abaixo do hero, na ordem do celular — que é também a ordem do
          HTML, então leitor de tela e Tab andam como a tela: o que pagar, o
          que saiu hoje, o saldo em conta, o planejar, o "a receber" e, por
          último, ligar os avisos. Nada de `order`: no desktop as áreas da
          grade seguem a mesma ordem — lembretes e movimentações lado a lado
          em cima, as ferramentas numa faixa no meio, o "a receber" e os
          avisos embaixo —, então o Tab desce como os olhos. A faixa ocupa a
          largura toda e começa abaixo do mais alto entre lembretes e
          movimentações; o "a receber" e os avisos, abaixo dela, começam
          juntos. Cada bloco leva a própria entrada (`rise-in`), com o atraso
          da sua altura na tela (ver `rise`). */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:[grid-template-areas:'reminders_today'_'tools_tools'_'bottom_bottom']">
        <div id="lembretes" className="rise-in scroll-mt-4 lg:[grid-area:reminders]" style={rise(120)}>
          <HomeReminders reminders={reminders} />
        </div>

        <div className="flex flex-col gap-5 lg:gap-6 lg:[grid-area:today]">
          <div className="rise-in flex flex-col gap-3" style={rise(100)}>
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
                hint="Lance a primeira pelo botão +."
              />
            ) : (
              <ul className="flex flex-col gap-2.5">{movementRows(todaysItems)}</ul>
            )}
          </div>

          {tomorrowsItems.length > 0 && (
            <div className="rise-in flex flex-col gap-3" style={rise(100)}>
              <SectionLabel>Amanhã</SectionLabel>
              <ul className="flex flex-col gap-2.5">
                {movementRows(tomorrowsItems)}
              </ul>
            </div>
          )}
        </div>

        {/* As ferramentas de planejar. No desktop, uma faixa de cards entre as
            listas do dia e o "a receber", lado a lado quando cabem 320px cada; no celular, o saldo em
            conta e o grupo "Planejar" (os cards completos somem ali, e o grupo
            some no desktop: um só de cada vez na árvore de acessibilidade). */}
        {/* Colunas contadas, não `auto-fit`: com três cards e espaço para
            dois, o terceiro ficava sozinho numa linha. Com três, no `lg` o
            saldo ocupa a linha de cima e as duas ferramentas dividem a de
            baixo; no `xl` cabem os três lado a lado. */}
        <div
          className={`flex flex-col gap-5 lg:grid lg:gap-4 lg:[grid-area:tools] ${
            cardOptions.length > 0 ? "lg:grid-cols-2 xl:grid-cols-3" : "lg:grid-cols-2"
          }`}
        >
          {/* O saldo em conta é um número de conferir, corrigido de tempos em
              tempos olhando o extrato, e não uma ferramenta de planejar — fica
              inteiro, fora do grupo. O `#saldo` é o destino do aviso de saldo
              velho no hero. */}
          <AccountBalanceCard
            id="saldo"
            balance={accountBalance}
            adjustedAt={adjustedAt}
            registeredMovement={registeredMovement}
            today={today}
            className={`rise-in scroll-mt-4 ${cardOptions.length > 0 ? "lg:col-span-2 xl:col-span-1" : ""}`}
            style={rise(120)}
          />

          {/* Sem cartão não há o que simular: a compra parcelada entra como uma
              compra de cartão para usar o fechamento e o vencimento de verdade,
              e um botão cuja única resposta possível é "cadastre um cartão" é
              ruído. No celular, a simulação mora no grupo "Planejar". */}
          {cardOptions.length > 0 && (
            <div
              className={homeCard("rise-in hidden items-center justify-between gap-4 lg:flex")}
              style={rise(120)}
            >
              <div className="flex min-w-0 flex-col gap-1.5">
                <SectionLabel>Posso comprar isso?</SectionLabel>
                <p className="text-sm text-pretty text-muted-foreground">
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
            className="rise-in hidden lg:flex"
            style={rise(120)}
          />

          <HomePlanLinks
            cards={cardOptions}
            categories={categoryOptions}
            slicesConfigured={slicesOverview.configured}
            slicesOver={slicesOver}
            className="rise-in lg:hidden"
            style={rise(120)}
          />
        </div>

        {/* O "a receber" e os avisos dividem a última faixa em partes iguais;
            se um deles não desenha nada (`empty:hidden`), o outro fica com a
            faixa inteira, em vez de deixar meia tela vazia ao lado. No
            celular, uma coluna só, com os avisos no fim. */}
        <div className="flex flex-col gap-5 lg:flex-row [&:not(:has(>:not(:empty)))]:hidden lg:items-start lg:gap-6 lg:[grid-area:bottom]">
          <div
            id="a-receber"
            className="rise-in scroll-mt-4 empty:hidden lg:min-w-0 lg:flex-1"
            style={rise(140)}
          >
            <HomeDebts debts={debts} />
          </div>

          {/* Ligar os avisos é coisa de uma vez: no celular, vai para o fim. */}
          {process.env.VAPID_PUBLIC_KEY && (
            <div className="rise-in empty:hidden lg:min-w-0 lg:flex-1" style={rise(140)}>
              <PushSetup publicKey={process.env.VAPID_PUBLIC_KEY} />
            </div>
          )}
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
} & (
  | { kind: "transaction"; transfer?: boolean; lent?: number }
  | { kind: "card"; cardId: string; installments: number }
);

function sumWhere(items: DayItem[], keep: (item: DayItem) => boolean): number {
  return items.filter(keep).reduce((sum, item) => sum + item.amount, 0);
}
