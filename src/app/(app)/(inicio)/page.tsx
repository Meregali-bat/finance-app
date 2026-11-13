import { differenceInCalendarDays, format as formatDay, subDays } from "date-fns";
import { Suspense } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  CalendarDays,
  ChevronRight,
  CircleAlert,
  CircleDollarSign,
  CreditCard,
  Receipt,
  TriangleAlert,
} from "lucide-react";
import { staleAdjustmentDays } from "@/lib/account-balance";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { EARLY_INCOME_DAYS, deferralTargetDate, fallsOnDay, ownSpendingOf } from "@/lib/period";
import { cumulativeDailySpending } from "@/lib/spending-trend";
import { AreaTrend } from "@/components/charts/area-trend";
import { loadBudgetInputs, registeredMovementOf } from "@/lib/budget-inputs";
import { formatCurrency, formatDate, formatDateOnly, installmentLabel } from "@/lib/format";
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
import { NextCycleCommitmentCard } from "@/components/next-cycle-commitment-card";
import { nextCycleCommitment } from "@/lib/next-cycle-commitment";
import { paceWarningFor } from "@/lib/pace-warning";
import { DEFAULT_COMMITMENT_LIMIT_PERCENT } from "@/lib/purchase-simulation";
import { PeriodSpendChart } from "@/components/period-spend-chart";

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

/**
 * O vencimento de um lembrete. Nos próximos três dias, em dias ("vence
 * amanhã", "vence em 3 dias"): é a urgência que se procura de relance, e a
 * lista destaca essas. Depois disso, a data.
 */
function dueText(kind: string, overdue: boolean, dueDate: Date, today: Date) {
  if (kind === "income") return `previsto em ${formatDate(dueDate)}`;
  if (overdue) return `venceu em ${formatDate(dueDate)}`;
  const days = differenceInCalendarDays(dueDate, today);
  if (days <= 0) return "vence hoje";
  if (days === 1) return "vence amanhã";
  if (days <= 3) return `vence em ${days} dias`;
  return `vence em ${formatDate(dueDate)}`;
}

export default async function DashboardPage() {
  const userId = await requireUserId();
  const today = new Date();

  // Tudo o que a tela pede sai junto, numa onda só. As fatias e o fechamento
  // do período chamam `loadBudgetInputs` por dentro, mas o `cache` do React
  // entrega a elas o mesmo resultado desta chamada, e as consultas que só
  // dependem do usuário (dívidas, compras de hoje) não precisam esperar por ele.
  // Datas de calendário ficam em meia-noite UTC: a janela das compras no cartão
  // de hoje e de amanhã vai de hoje a depois de amanhã.
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const [inputs, categories, profile, debts, recentCardPurchases, slicesOverview, lastCardPurchases] =
    await Promise.all([
      loadBudgetInputs(userId),
      prisma.category.findMany({
        where: { userId, active: true },
        orderBy: { name: "asc" },
      }),
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { name: true, email: true, avatar: true, commitmentLimitPercent: true },
      }),
      loadDebts(userId, today),
      // As compras no cartão de hoje e de amanhã, com o que a lista precisa
      // mostrar (as entradas do orçamento só guardam valor e data).
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
      // As últimas compras no cartão, até amanhã: a lista "Últimas
      // movimentações" do desktop junta essas com os lançamentos da conta.
      prisma.cardPurchase.findMany({
        where: {
          userId,
          card: { deletedAt: null },
          date: { lt: new Date(todayUtc + 2 * 86_400_000) },
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take: 6,
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
    ]);

  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const { accountBalance, budget, dailyAvailable, reservedForLater, savings, nextPeriod, periods } =
    todayBudget(inputs, today);
  // "Se continuar gastando assim, vai faltar": o aviso da Previsão, aqui, onde
  // quem precisa dele olha. O mesmo cálculo do aviso no celular do dia 10.
  const paceWarn = paceWarningFor(inputs, periods, today, dailyAvailable);
  // O cartão come o mês seguinte em silêncio: o peso das faturas sobre a
  // renda do próximo ciclo, quando já passa de 30%.
  const commitment = nextCycleCommitment(
    nextPeriod,
    profile.commitmentLimitPercent ?? DEFAULT_COMMITMENT_LIMIT_PERCENT,
  );
  const commitmentCard = commitment && (
    <NextCycleCommitmentCard
      commitment={commitment}
      limitPercent={profile.commitmentLimitPercent ?? DEFAULT_COMMITMENT_LIMIT_PERCENT}
      startLabel={formatDate(commitment.periodStart)}
      reservedNow={reservedForLater > 0.005}
      limitIsDefault={profile.commitmentLimitPercent == null}
      paceTarget={
        paceWarn?.offset === 1 && paceWarn.perDayTarget !== null && dailyAvailable >= 0
          ? formatCurrency(paceWarn.perDayTarget)
          : null
      }
    />
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

  // Quando o saldo foi informado pela última vez: o "Pagar" oferece dizer que a
  // conta já tinha saído dele, para não sair de novo.
  const readingAt = inputs.account.adjustment?.createdAt ?? null;
  const readingLabel = readingAt ? formatDate(readingAt) : null;

  const reminders: HomeReminder[] = [
    ...budget.cardBillReminders.map((bill) => ({
      kind: "due" as const,
      source: "card" as const,
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
      readingLabel,
    })),
    ...budget.fixedExpenseReminders.map((exp) => ({
      kind: "due" as const,
      source: "fixed" as const,
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
      readingLabel,
    })),
    ...budget.incomeReminders.map((inc) => ({
      kind: "income" as const,
      key: `income-${inc.incomeId}-${inc.dueDate.toISOString()}`,
      label: incomeLabelById.get(inc.incomeId) ?? "Receita fixa",
      amount: inc.amount,
      dueDate: inc.dueDate,
      overdue: false,
      incomeId: inc.incomeId,
      early: inc.early ?? false,
      earliestOn: inc.early
        ? formatDay(subDays(inc.dueDate, EARLY_INCOME_DAYS), "yyyy-MM-dd")
        : undefined,
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
        dueText(r.kind, r.overdue, r.dueDate, today),
        r.kind === "income" && r.early ? "caiu antes? confirme já" : null,
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

  // O título do número do dia: o mesmo no hero do celular e no card do desktop.
  const heroTitle = isOverBudget ? (
    staleDays != null ? (
      <>
        Pode estar no vermelho: saldo conferido{" "}
        <span className="whitespace-nowrap">há {staleDays} dias</span>
      </>
    ) : (
      "Este período está no vermelho"
    )
  ) : allToSavings ? (
    "Hoje, o que sobra vai para guardar"
  ) : isTight ? (
    "Apertado até receber"
  ) : (
    "Por dia, até receber"
  );
  const daysLeftText =
    budget.daysRemaining === 1 ? "falta 1 dia" : `faltam ${budget.daysRemaining} dias`;
  const firstName = profile.name?.trim().split(/\s+/)[0] ?? null;
  // O que entrou de renda no período e o que ainda espera confirmação.
  // O antecipado é o salário do ciclo que vem: não é renda deste a confirmar.
  const incomeToConfirm = budget.incomeReminders
    .filter((r) => !r.early)
    .reduce((sum, r) => sum + r.amount, 0);
  const averagePerDay = spentInPeriod / Math.max(1, Math.min(elapsedDays, spendingTrend.length));

  // "Últimas movimentações" do desktop: conta e cartão juntos, do mais novo
  // para o mais antigo, até amanhã (o que já está agendado aparece com o dia).
  const untilTomorrow = todayUtc + 2 * 86_400_000;
  const recentItems: DayItem[] = [
    ...transactions
      .filter((t) => t.date.getTime() < untilTomorrow)
      .map((t) => ({ ...t, kind: "transaction" as const })),
    ...lastCardPurchases.map((p) => ({ ...p, amount: Number(p.amount), kind: "card" as const })),
  ]
    .sort(
      (a, b) =>
        b.date.getTime() - a.date.getTime() ||
        (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
    )
    .slice(0, 5);
  const recentDay = (date: Date) =>
    fallsOnDay(date, today) ? "hoje" : fallsOnDay(date, tomorrow) ? "amanhã" : formatDateOnly(date);

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
      {/* Um modal que só abre quando há fechamento: não segura o resto da tela. */}
      <Suspense fallback={null}>
        <PeriodCloseCheck />
      </Suspense>

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
      {/* Desktop: a saudação, o período, o sino dos lembretes e o botão de
          lançar. No celular o cabeçalho não gera caixa (`contents`): só o
          botão + existe ali, fixo no canto, acima da barra inferior; ele
          recolhe ao rolar para baixo. */}
      <header className="contents lg:flex lg:items-end lg:justify-between lg:gap-6">
        <div className="rise-in hidden flex-col gap-1.5 lg:flex" style={rise(0)}>
          {/* Texto, não título: o h1 da página é a frase do número do dia. */}
          <p className="font-heading text-[30px] leading-none font-bold tracking-[-0.035em]">
            {firstName ? `Olá, ${firstName}!` : "Olá!"} <span aria-hidden="true">👋</span>
          </p>
          <p className="text-[15px] text-muted-foreground">
            {heading.weekday}, {heading.day} · {daysLeftText} para o próximo pagamento
          </p>
        </div>
        <div className="contents lg:flex lg:items-center lg:gap-2.5">
          <Link
            href="/previsao?p=0"
            className="rise-in hidden h-11 items-center gap-2 rounded-full bg-card px-4 text-sm font-medium whitespace-nowrap shadow-(--shadow-card) transition-colors duration-150 hover:bg-card-hover lg:flex"
            style={rise(0)}
            title="Ver o período na Previsão"
          >
            <CalendarDays className="size-[18px] text-muted-foreground" aria-hidden="true" />
            <span className="tabular-nums">
              {formatDate(budget.periodStart)} – {formatDate(budget.periodEnd)}
            </span>
          </Link>
          {/* Âncora nativa: o `hashchange` abre a lista inteira dos lembretes. */}
          <a
            href="#lembretes"
            aria-label={
              reminders.length > 0
                ? `Lembretes: ${reminders.length} pendente${reminders.length === 1 ? "" : "s"}`
                : "Lembretes: nenhum pendente"
            }
            className="rise-in relative hidden size-11 items-center justify-center rounded-full bg-card shadow-(--shadow-card) transition-colors duration-150 hover:bg-card-hover lg:flex"
            style={rise(0)}
          >
            <Bell className="size-[19px]" aria-hidden="true" />
            {reminders.length > 0 && (
              <span
                aria-hidden="true"
                className="absolute top-2.5 right-2.5 size-2.5 rounded-full bg-negative ring-2 ring-card"
              />
            )}
          </a>
          <ScrollAwayFab className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+74px)] z-20 lg:static lg:bottom-auto lg:z-auto">
            <MovementFormDialog cards={cardOptions} categories={categoryOptions} shortcut="n" />
          </ScrollAwayFab>
        </div>
      </header>

      {/* O card de destaque. O número do dia é a única figura grande: à
          esquerda, ele, a régua do período e, sob ela, a curva do gasto, em
          tamanho de legenda (é o que já foi), e a linha do livre até
          receber. No desktop, a coluna da direita olha para a frente: as
          próximas contas e a conta do número. No celular as duas colunas
          empilham, na mesma ordem do HTML, e as contas somem — os lembretes
          vêm logo abaixo. */}
      <section
        aria-label="Orçamento de hoje"
        className="hero-surface rise-in relative overflow-hidden rounded-[26px] lg:hidden"
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
                  {heroTitle}
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
                {/* No ritmo de agora, um ciclo (este ou o próximo) fecha no
                    vermelho: quanto falta, quando, e o "por dia" que evita. No
                    vermelho de verdade ele não aparece: o hero já diz que o
                    período fecha no negativo. */}
                {paceWarn && !isOverBudget && (
                  <div className="flex flex-col gap-0.5 text-sm">
                    {/* Primeiro o que fazer, dito contra o ciclo certo; depois,
                        mais fraco, o porquê (o ritmo e o tamanho do buraco).
                        "Fecha no negativo", e não "faltam": a régua usa
                        "faltam" para dias. */}
                    <p className="flex items-start gap-1 font-medium text-(--hero-fg) text-pretty tabular-nums">
                      <CircleAlert aria-hidden="true" className="mt-[3px] size-3.5 shrink-0" />
                      <span>
                        {paceWarn.perDayTarget !== null
                          ? `Para ${paceWarn.offset === 0 ? "este ciclo" : "o próximo ciclo"} não fechar no negativo, fique em ${formatCurrency(paceWarn.perDayTarget)} por dia até ${formatDate(paceWarn.lastDay)}`
                          : `${paceWarn.offset === 0 ? "Este ciclo" : "O próximo ciclo"} fecha ${formatCurrency(-paceWarn.left)} no negativo em ${formatDate(paceWarn.lastDay)}, mesmo sem gastar mais.`}
                      </span>
                    </p>
                    <p className="ml-[18px] text-(--hero-muted) text-pretty tabular-nums">
                      {paceWarn.perDayTarget !== null &&
                        `No ritmo de agora, ${formatCurrency(paceWarn.perDay)} por dia, ele fecha ${formatCurrency(-paceWarn.left)} no negativo `}
                      {/* O ponto junto do link: sem isso, ele sobrava sozinho no
                          fim da linha quando o link quebrava. */}
                      <span className="whitespace-nowrap">
                        {paceWarn.perDayTarget !== null && "· "}
                        <Link
                          href={`/previsao?p=${paceWarn.offset}`}
                          className={cn(heroLink, "-my-3 inline-block py-3")}
                        >
                          Ver na Previsão
                        </Link>
                      </span>
                    </p>
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
                  {/* No celular também: sem ele, a curva embaixo da régua não
                      dizia o que mede. */}
                  <p>
                    Gasto no período{" "}
                    <span className="font-semibold text-(--hero-fg)">
                      {formatCurrency(spentInPeriod)}
                    </span>
                  </p>
                  {/* No celular, as duas linhas alinhadas à esquerda, uma embaixo da
                      outra; no desktop, cada uma numa ponta. */}
                  <p className="lg:ml-auto lg:text-right">
                    {/* Cada parte inteira: se não couber, quebra entre elas,
                        nunca no meio do valor. */}
                    {/* No desktop, a conta ao lado já mostra o "Livre até
                        receber": aqui fica só no celular, onde ela está fechada. */}
                    {!isOverBudget && (
                      <>
                        <span className="whitespace-nowrap lg:hidden">
                          Livre até receber{" "}
                          <span
                            className={`font-semibold ${
                              budget.periodBalance < 0 ? "text-negative" : "text-(--hero-fg)"
                            }`}
                          >
                            {formatCurrency(budget.periodBalance)}
                          </span>
                          {" ·"}
                        </span>
                        <span className="lg:hidden"> </span>
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

      {/* Desktop: a fileira de números. O do dia vem primeiro e maior, na
          cor da marca quando o dia está normal; nos dias de cuidado ele leva
          as cores do hero (apertado, vermelho). Depois o saldo em conta (com
          o lápis de conferir), a renda que entrou e o gasto do período. */}
      <div className="rise-in hidden lg:grid lg:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,1fr))] lg:gap-4" style={rise(40)}>
        <section
          aria-label="Orçamento de hoje"
          className="hero-surface hero-brand relative overflow-hidden rounded-[20px] p-5"
          data-tone={isOverBudget ? "negative" : isTight ? "tight" : undefined}
        >
          <div className="relative z-10 flex items-start gap-3">
            <span
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-(--hero-chip) text-(--hero-fg)"
            >
              <CircleDollarSign className="size-5" />
            </span>
            <div className="flex min-w-0 flex-col gap-1.5">
              <h1 className="flex items-start gap-1.5 text-[12.5px] font-medium text-(--hero-muted)">
                {isOverBudget && (
                  <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0 text-negative" />
                )}
                <span>
                  {heroTitle}
                  <span className="sr-only">
                    {isOverBudget
                      ? `. Por dia: ${formatCurrency(dailyAvailable)}`
                      : `: ${formatCurrency(dailyAvailable)}`}
                  </span>
                </span>
              </h1>
              <CountUpCurrency
                value={dailyAvailable}
                memoryKey="home:daily-kpi"
                announce={false}
                className={`font-heading text-[30px] leading-none font-bold tracking-[-0.04em] tabular-nums ${
                  isOverBudget && staleDays == null ? "text-negative" : "text-(--hero-fg)"
                }`}
              />
              <p className="text-xs text-(--hero-muted) tabular-nums">
                {isOverBudget || allToSavings || isTight
                  ? `por dia até ${formatDate(budget.periodEnd)}`
                  : `por dia · pagamento em ${formatDate(budget.periodEnd)}`}
              </p>
              {spentToday >= 0.005 && (
                <p className="text-xs text-(--hero-muted) tabular-nums">
                  já descontado hoje:{" "}
                  <span className="font-semibold text-(--hero-fg)">{formatCurrency(spentToday)}</span>
                </p>
              )}
            </div>
          </div>
        </section>

        <AccountBalanceCard
          id="saldo-kpi"
          variant="kpi"
          balance={accountBalance}
          adjustedAt={adjustedAt}
          registeredMovement={registeredMovement}
          today={today}
          className="scroll-mt-4"
        />

        <div className={homeCard("flex items-start gap-3 lg:p-5")}>
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-positive/14 text-positive"
          >
            <ArrowDownLeft className="size-5" />
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 className="text-[12.5px] font-medium text-muted-foreground">Renda recebida</h2>
            <p className="font-heading text-[24px] leading-none font-bold tracking-[-0.035em] tabular-nums">
              {formatCurrency(budget.incomeTotal)}
            </p>
            <p
              className={cn(
                "text-xs tabular-nums",
                incomeToConfirm >= 0.005 ? "font-semibold text-positive" : "text-muted-foreground",
              )}
            >
              {incomeToConfirm >= 0.005
                ? `+ ${formatCurrency(incomeToConfirm)} a confirmar`
                : `próximo em ${formatDate(budget.periodEnd)}`}
            </p>
          </div>
        </div>

        <div className={homeCard("flex items-start gap-3 lg:p-5")}>
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-negative/12 text-negative"
          >
            <ArrowUpRight className="size-5" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <h2 className="text-[12.5px] font-medium text-muted-foreground">Gasto no período</h2>
            <p className="font-heading text-[24px] leading-none font-bold tracking-[-0.035em] tabular-nums">
              {formatCurrency(spentInPeriod)}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              média de {formatCurrency(averagePerDay)} por dia
            </p>
          </div>
        </div>
      </div>

      {/* Desktop: o período em uma faixa. À esquerda, a régua dos dias e o
          que é preciso saber hoje (vermelho, apertado, ritmo, saldo velho);
          à direita, aberta, a conta do número — o que faz confiar nele. */}
      <section
        aria-label="O período"
        className={homeCard(
          "rise-in hidden lg:grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-8 lg:p-5",
        )}
        style={rise(80)}
      >
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <SectionLabel>Seu período</SectionLabel>
            <p className="text-[13px] text-muted-foreground tabular-nums">
              dia {Math.min(elapsedDays, rulerDays)} de {rulerDays} · {daysLeftText}
            </p>
          </div>
          <div className="[--ruler-gap:3px]">
            <DayRuler totalDays={totalDays} elapsedDays={elapsedDays} />
          </div>
          <div className="flex flex-col gap-2 text-pretty tabular-nums">
            {isOverBudget && (
              <p className="flex items-start gap-1.5 font-medium">
                <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-negative" />
                <span>
                  {staleDays != null
                    ? `Se a estimativa estiver certa, o período fecha ${formatCurrency(periodDeficit)} no negativo. `
                    : `O período fecha ${formatCurrency(periodDeficit)} no negativo, mesmo sem gastar mais nada. `}
                  {staleDays != null ? (
                    <a href="#saldo-kpi" className={heroLink}>
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
                </span>
              </p>
            )}
            {staleDays != null && !isOverBudget && (
              <p className="flex items-start gap-1.5">
                <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>
                  Conta feita com o saldo conferido há {staleDays} dias ·{" "}
                  <a href="#saldo-kpi" className={heroLink}>
                    Conferir
                  </a>
                </span>
              </p>
            )}
            {isTight && (
              <p className="font-medium">
                {tightTomorrow != null
                  ? `${spentToday >= 0.005 ? "Se hoje ficar só nisso" : "Se hoje passar sem gastos"}, amanhã sobe para ${formatCurrency(tightTomorrow)} por dia. `
                  : "As contas previstas até o pagamento já estão cobertas. "}
                {canDefer && (
                  <a href="#lembretes" className={cn(heroLink, "font-normal")}>
                    Veja o que dá para adiar
                  </a>
                )}
              </p>
            )}
            {paceWarn && !isOverBudget && (
              <p className="flex items-start gap-1.5">
                <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>
                  {paceWarn.perDayTarget !== null
                    ? `Para ${paceWarn.offset === 0 ? "este ciclo" : "o próximo ciclo"} não fechar no negativo, fique em ${formatCurrency(paceWarn.perDayTarget)} por dia até ${formatDate(paceWarn.lastDay)}. `
                    : `${paceWarn.offset === 0 ? "Este ciclo" : "O próximo ciclo"} fecha ${formatCurrency(-paceWarn.left)} no negativo em ${formatDate(paceWarn.lastDay)}, mesmo sem gastar mais. `}
                  <Link href={`/previsao?p=${paceWarn.offset}`} className={heroLink}>
                    Ver na Previsão
                  </Link>
                </span>
              </p>
            )}
            {savingsShortfall && <p className="text-muted-foreground">{savingsShortfall}</p>}
            {!isOverBudget && !isTight && !paceWarn && !savingsShortfall && staleDays == null && (
              <p className="text-muted-foreground">
                Livre até receber:{" "}
                <span className="font-semibold text-foreground">
                  {formatCurrency(budget.periodBalance)}
                </span>
                {setAside && (
                  <>
                    {" · "}
                    <Link href={setAside.href} className={heroLink}>
                      {formatCurrency(setAside.amount)} {setAside.label}
                    </Link>
                  </>
                )}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1 pl-8 text-[13px] leading-snug shadow-[-1px_0_0_0_var(--hairline)]">
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
      </section>

      {/* Tudo abaixo, na ordem do celular — que é também a ordem do HTML:
          o que pagar, o que saiu hoje, o próximo ciclo, o saldo e o
          planejar, o "a receber" e os avisos. No desktop, uma grade de três
          colunas que segue a mesma ordem (o gráfico, que só existe ali, vem
          antes): gráfico e contas a pagar; últimas movimentações, próximo
          ciclo e "posso comprar isso?"; fatias, "a receber" e avisos. Os
          blocos só do celular somem da grade em `lg`. */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-3 lg:gap-6">
        <section
          aria-label="Gasto no período, dia a dia"
          className={homeCard("rise-in hidden lg:col-span-2 lg:flex lg:flex-col lg:gap-4 lg:p-5")}
          style={rise(100)}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2.5 font-heading text-[18px] leading-tight font-bold tracking-[-0.025em]">
              <BarChart3 className="size-5 text-primary" aria-hidden="true" />
              Gasto no período
            </h2>
            <div className="flex items-center gap-4 text-[12.5px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
                Acumulado
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2 rounded-full bg-primary/30" />
                Por dia
              </span>
              <Link href="/historico" className="font-semibold text-primary hover:underline">
                Histórico
                <ArrowRight className="ml-1 inline size-3.5 align-[-2px]" aria-hidden="true" />
              </Link>
            </div>
          </div>
          <PeriodSpendChart
            cumulative={spendingTrend.map((p) => p.value)}
            periodStart={budget.periodStart}
            totalDays={rulerDays}
          />
        </section>

        <div id="lembretes" className="rise-in flex scroll-mt-4 flex-col gap-3" style={rise(120)}>
          <HomeReminders reminders={reminders} panel />
        </div>

        {/* Celular: o que saiu hoje e o que está marcado para amanhã. */}
        <div className="flex flex-col gap-5 lg:hidden">
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
              <ul className="flex flex-col gap-2.5">{movementRows(tomorrowsItems)}</ul>
            </div>
          )}
        </div>

        {/* Desktop: as últimas movimentações, de qualquer dia. */}
        <section
          aria-label="Últimas movimentações"
          className={homeCard("rise-in hidden lg:flex lg:flex-col lg:gap-2 lg:p-5")}
          style={rise(140)}
        >
          <div className="flex items-center justify-between gap-3">
            <SectionLabel>Últimas movimentações</SectionLabel>
            <Link href="/historico" className="text-[13px] font-semibold text-primary hover:underline">
              Ver todas
              <ArrowRight className="ml-1 inline size-3.5 align-[-2px]" aria-hidden="true" />
            </Link>
          </div>
          {recentItems.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma movimentação ainda. Lance a primeira pelo botão acima.
            </p>
          ) : (
            <ul className="flex flex-col">
              {recentItems.map((t) => {
                const income = t.amount < 0;
                return (
                  <li key={`${t.kind}-${t.id}`} className="border-b border-(--hairline) last:border-b-0">
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
                      <div className="-mx-2 flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2.5 transition-colors duration-150 hover:bg-card-hover">
                        <span
                          aria-hidden="true"
                          className={cn(
                            "flex size-9 shrink-0 items-center justify-center rounded-full",
                            income ? "bg-positive/14 text-positive" : "bg-negative/10 text-negative",
                          )}
                        >
                          {income ? (
                            <ArrowDownLeft className="size-[17px]" />
                          ) : (
                            <ArrowUpRight className="size-[17px]" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14.5px] font-semibold">{t.description}</p>
                          <p className="truncate text-[12.5px] text-muted-foreground">
                            {recentDay(t.date)} ·{" "}
                            {t.kind === "card" ? `no ${cardNameById.get(t.cardId) ?? "cartão"}` : "na conta"}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 text-[14.5px] font-semibold tabular-nums",
                            income && "text-positive",
                          )}
                        >
                          {income ? `+ ${formatCurrency(-t.amount)}` : `− ${formatCurrency(t.amount)}`}
                        </span>
                      </div>
                    </MovementFormDialog>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* O que o cartão já tirou do próximo ciclo. No desktop o card se
            explica sozinho, e o rótulo de fora sai. */}
        {commitmentCard && (
          <div className="rise-in flex flex-col gap-3 lg:[&>section]:h-full" style={rise(140)}>
            <div className="lg:hidden">
              <SectionLabel>Próximo ciclo</SectionLabel>
            </div>
            {commitmentCard}
          </div>
        )}

        {/* Desktop: a simulação, em destaque. Sem cartão não há o que simular. */}
        {cardOptions.length > 0 && (
          <section
            aria-label="Posso comprar isso?"
            className="rise-in relative hidden overflow-hidden rounded-[20px] bg-brand p-6 text-brand-foreground shadow-(--shadow-card) lg:flex lg:flex-col lg:justify-end lg:gap-3"
            style={rise(140)}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 32 32"
              className="pointer-events-none absolute -top-6 -right-6 size-40 opacity-15"
            >
              <circle
                cx="16"
                cy="16"
                r="11"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                pathLength={100}
                strokeDasharray="70 100"
                transform="rotate(-90 16 16)"
              />
              <circle cx="7.1" cy="9.53" r="1.8" fill="currentColor" />
            </svg>
            <h2 className="mt-10 font-heading text-[21px] leading-tight font-bold tracking-[-0.025em]">
              Posso comprar isso?
            </h2>
            <p className="max-w-[28ch] text-sm text-pretty opacity-80">
              Simule uma compra no cartão e veja se ela cabe nos próximos ciclos.
            </p>
            <PurchaseSimulationDialog
              cards={cardOptions}
              categories={categoryOptions}
              trigger={{
                className:
                  "mt-1 inline-flex h-10 w-fit items-center gap-1.5 rounded-full bg-white px-4 text-[13.5px] font-semibold text-brand transition-[background-color,transform] duration-150 hover:bg-white/90 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
                children: (
                  <>
                    Simular compra
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </>
                ),
              }}
            />
          </section>
        )}

        {/* Celular: o saldo em conta e o grupo "Planejar". O `#saldo` é o
            destino do aviso de saldo velho no hero. */}
        <div className="flex flex-col gap-5 lg:hidden">
          <AccountBalanceCard
            id="saldo"
            balance={accountBalance}
            adjustedAt={adjustedAt}
            registeredMovement={registeredMovement}
            today={today}
            className="rise-in scroll-mt-4"
            style={rise(120)}
          />
          <HomePlanLinks
            cards={cardOptions}
            categories={categoryOptions}
            slicesConfigured={slicesOverview.configured}
            slicesOver={slicesOver}
            className="rise-in"
            style={rise(120)}
          />
        </div>

        <HomeSlicesCard
          configured={slicesOverview.configured}
          usage={slicesOverview.usage}
          savings={slicesOverview.savings}
          className="rise-in hidden lg:flex lg:p-5"
          style={rise(160)}
        />

        <div
          id="a-receber"
          className="rise-in scroll-mt-4 empty:hidden lg:min-w-0"
          style={rise(160)}
        >
          <HomeDebts debts={debts} />
        </div>

        {/* Ligar os avisos é coisa de uma vez: no celular, vai para o fim. */}
        {process.env.VAPID_PUBLIC_KEY && (
          <div className="rise-in empty:hidden lg:min-w-0" style={rise(160)}>
            <PushSetup publicKey={process.env.VAPID_PUBLIC_KEY} />
          </div>
        )}
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
