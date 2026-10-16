import { differenceInCalendarDays } from "date-fns";
import { AlertTriangle, ArrowDownLeft, Receipt } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { deferralTargetDate, fallsOnDay, type OpeningSource } from "@/lib/period";
import { cumulativeDailySpending } from "@/lib/spending-trend";
import { AreaTrend } from "@/components/charts/area-trend";
import { forecastPeriods } from "@/lib/forecast";
import { calculateCurrentBudget } from "@/lib/carry-over";
import { accountBalanceOf, loadBudgetInputs, registeredMovementOf } from "@/lib/budget-inputs";
import { formatCurrency, formatDate, formatDateLong } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionLabel } from "@/components/page-header";
import { AnimatedCurrency } from "@/components/ui/animated-number";
import { Progress } from "@/components/ui/progress";
import { MovementFormDialog } from "@/components/forms/movement-form-dialog";
import { MovementRow } from "@/components/movement-row";
import { toMovementValues } from "@/lib/history-item";
import { MarkIncomeReceivedDialog } from "@/components/mark-income-received-dialog";
import { ConfirmPaymentDialog } from "@/components/confirm-payment-dialog";
import { markCardBillPaid, markFixedExpensePaid } from "@/lib/actions/expense-payment";
import { deferFixedExpense } from "@/lib/actions/expense";
import { DeferExpenseDialog } from "@/components/defer-expense-dialog";
import { PeriodCloseCheck } from "@/components/period-close-check";
import { AccountBalanceCard } from "@/components/account-balance-card";
import { PurchaseSimulationDialog } from "@/components/forms/purchase-simulation-dialog";

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

export default async function DashboardPage() {
  const userId = await requireUserId();
  const today = new Date();

  const [inputs, categories] = await Promise.all([
    loadBudgetInputs(userId),
    prisma.category.findMany({ where: { userId, active: true }, orderBy: { name: "asc" } }),
  ]);

  const accountBalance = accountBalanceOf(inputs, today);
  const registeredMovement = registeredMovementOf(inputs, today);

  // Com o saldo em conta informado, o período sai do dinheiro real; sem ele, da
  // corrente dos períodos anteriores. Nos dois casos o mês passado pesa neste.
  const budget = calculateCurrentBudget({ ...inputs, accountBalance, today });
  const transactions = inputs.transactions.filter((t) => !t.fromPeriodClose);

  // O "pode gastar hoje" é o livre do período corrente da Previsão: o saldo do
  // período menos o que precisa ficar guardado para um ciclo à frente que não
  // se paga. Sem renda não há ciclos, e vale o saldo do período dividido.
  const [current] = forecastPeriods({
    ...inputs,
    openingBalance: budget.openingBalance,
    today,
    count: 0,
  });
  const dailyAvailable = current?.dailyAvailable ?? budget.dailyAvailable;
  const reservedForLater = current?.reservedForLater ?? 0;

  const totalDays = differenceInCalendarDays(budget.periodEnd, budget.periodStart);
  const elapsedDays = totalDays - budget.daysRemaining + 1;
  const progressPercent = totalDays > 0 ? Math.min(100, Math.round((elapsedDays / totalDays) * 100)) : 0;

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

  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

  // `fallsOnDay`, e não uma comparação de meia-noite local dos dois lados:
  // `Transaction.date` guarda um dia de calendário na parte UTC, e lê-lo no
  // fuso local trazia o lançamento de amanhã para "hoje" e escondia o de hoje.
  // O card de resumo acima já lia certo, então as duas metades da tela
  // discordavam.
  const todaysTransactions = transactions.filter((t) => fallsOnDay(t.date, today));
  const tomorrowsTransactions = transactions
    .filter((t) => fallsOnDay(t.date, tomorrow))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const isOverBudget = dailyAvailable < 0;

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

  const reminders = [
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
      defer: deferOptions(exp.expenseId, exp.dueDate),
      deferredIn: exp.deferredIn ?? 0,
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
  ].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  return (
    <div className="flex flex-col gap-6">
      <PeriodCloseCheck />

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground first-letter:uppercase">
          {formatDateLong(today)}
        </p>
        {/* Fora de `lg` o botão é fixo no canto da viewport, então a posição
            dele aqui no DOM não importa; em `lg` ele volta ao fluxo e fica
            como ação do cabeçalho. */}
        <div className="fixed bottom-20 right-4 z-10 lg:static lg:z-auto">
          <MovementFormDialog cards={cardOptions} categories={categoryOptions} />
        </div>
      </div>

      {/* O card de destaque: degradê garnet, o número do dia em branco e o
          ritmo de gasto do período logo abaixo. */}
      <section
        aria-label="Orçamento de hoje"
        className="hero-surface relative overflow-hidden rounded-[1.75rem] text-white shadow-float ring-1 ring-white/10"
      >
        <div className="relative z-10 flex flex-col gap-6 p-6 lg:p-8 xl:grid xl:grid-cols-[1fr_1fr] xl:gap-10">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <p className="text-sm text-white/70">
                {isOverBudget ? "Você já estourou o orçamento de hoje" : "Você pode gastar hoje"}
              </p>
              <AnimatedCurrency
                value={dailyAvailable}
                className={`font-heading text-[3rem] leading-[1] font-bold tracking-[-0.04em] lg:text-[3.75rem] ${
                  isOverBudget ? "text-negative" : "text-white"
                }`}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Progress
                value={progressPercent}
                className="[&_[data-slot=progress-track]]:bg-white/15"
                indicatorClassName={isOverBudget ? "bg-negative" : "bg-white"}
              />
              <div className="flex justify-between text-xs text-white/70 tabular-nums">
                <span>
                  Dia {Math.max(1, elapsedDays)} de {Math.max(1, totalDays)}
                </span>
                <span>
                  {budget.daysRemaining}{" "}
                  {budget.daysRemaining === 1 ? "dia restante" : "dias restantes"}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="flex flex-col rounded-2xl bg-black/20 px-4 py-2.5 ring-1 ring-white/10">
                <span className="text-[0.6875rem] font-semibold tracking-[0.08em] text-white/60 uppercase">
                  Saldo do período
                </span>
                <span className="font-medium tabular-nums">
                  {formatCurrency(budget.periodBalance)}
                </span>
              </div>
              <div className="flex flex-col rounded-2xl bg-black/20 px-4 py-2.5 ring-1 ring-white/10">
                <span className="text-[0.6875rem] font-semibold tracking-[0.08em] text-white/60 uppercase">
                  Recebe em
                </span>
                <span className="font-medium">{formatDate(budget.periodEnd)}</span>
              </div>
            </div>
            {(caption || reservedForLater > 0.005) && (
              <div className="flex flex-col gap-0.5 text-xs text-white/70">
                {caption && <p>{caption}</p>}
                {reservedForLater > 0.005 && (
                  <p>já contando {formatCurrency(reservedForLater)} que vão faltar mais à frente</p>
                )}
              </div>
            )}
          </div>

          {/* O ritmo do período: quanto do dia a dia (lançamentos e compras no
              cartão) já saiu, dia a dia. Uma série só, então sem legenda — o
              título diz o que é. */}
          <div className="flex flex-col justify-end gap-2 border-t border-white/10 pt-5 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-10">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm text-white/70">Gasto no período</p>
              <p className="font-heading text-lg font-semibold tracking-[-0.02em]">
                {formatCurrency(spendingTrend.at(-1)?.value ?? 0)}
              </p>
            </div>
            <AreaTrend
              points={spendingTrend}
              stroke="#ffd2cb"
              title="Gasto acumulado no período"
            />
            <div className="flex justify-between text-[0.6875rem] text-white/60 tabular-nums">
              <span>{spendingTrend[0]?.label}</span>
              <span>hoje</span>
            </div>
          </div>
        </div>
      </section>

      <AccountBalanceCard
        balance={accountBalance}
        adjustedAt={inputs.account.adjustment?.createdAt ?? null}
        registeredMovement={registeredMovement}
      />

      {/* Sem cartão não há o que simular: a compra parcelada entra como uma
          compra de cartão para usar o fechamento e o vencimento de verdade, e
          um botão cuja única resposta possível é "cadastre um cartão" é ruído. */}
      {cardOptions.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-col gap-1">
              <SectionLabel>Posso comprar isso?</SectionLabel>
              <p className="text-sm text-muted-foreground">
                Simule uma compra no cartão e veja se ela cabe nos próximos ciclos.
              </p>
            </div>
            <div className="shrink-0 [&>button]:w-full sm:[&>button]:w-auto">
              <PurchaseSimulationDialog cards={cardOptions} categories={categoryOptions} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* As duas listas ficam lado a lado a partir de `xl`. Em `lg` sobrariam
          ~340px por coluna, o que trunca o valor dos lembretes. `items-start`
          impede que a coluna mais curta esticasse até a altura da outra. */}
      <div className="flex flex-col gap-6 xl:grid xl:grid-cols-2 xl:items-start">
        {reminders.length > 0 && (
          <div className="flex flex-col gap-3">
            <SectionLabel>Lembretes</SectionLabel>
            <div className="flex flex-col gap-2">
              {reminders.map((reminder) => {
                const isIncome = reminder.kind === "income";
                return (
                  <Card
                    key={reminder.key}
                    // Faixa lateral em vez de só um ícone: a cor identifica o
                    // tipo do lembrete de relance, antes de ler o texto.
                    className={`pl-1 before:absolute before:inset-y-0 before:left-0 before:w-1 ${
                      isIncome ? "before:bg-positive" : "before:bg-negative"
                    }`}
                  >
                    {/* A ação fica numa linha própria no celular: espremida ao
                        lado do texto, ela quebrava o valor em duas linhas. */}
                    <CardContent className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        {isIncome ? (
                          <ArrowDownLeft
                            className="size-4 shrink-0 text-positive"
                            aria-hidden="true"
                          />
                        ) : (
                          <AlertTriangle
                            className="size-4 shrink-0 text-negative"
                            aria-hidden="true"
                          />
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-medium">{reminder.label}</p>
                          {/* Sem `truncate`: quando o texto não cabe ao lado do
                              botão, quebrar numa segunda linha preserva a data
                              do lembrete, que era o que o "…" comia. */}
                          <p className="text-sm text-muted-foreground tabular-nums">
                            {formatCurrency(reminder.amount)} ·{" "}
                            {isIncome ? "previsto em" : reminder.overdue ? "venceu em" : "vence em"}{" "}
                            {formatDate(reminder.dueDate)}
                            {reminder.kind === "due" &&
                              reminder.deferredIn > 0 &&
                              ` · inclui ${formatCurrency(reminder.deferredIn)} adiados`}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2 [&>button]:flex-1 sm:[&>button]:flex-none">
                        {reminder.kind === "due" && reminder.defer && (
                          <DeferExpenseDialog
                            action={reminder.defer.action}
                            label={reminder.label}
                            dueDate={reminder.dueDate}
                            amount={reminder.amount}
                            nextMonthTarget={reminder.defer.nextMonthTarget}
                            endTarget={reminder.defer.endTarget}
                          />
                        )}
                        {reminder.kind === "income" ? (
                          <MarkIncomeReceivedDialog
                            incomeId={reminder.incomeId}
                            label={reminder.label}
                            dueDate={reminder.dueDate}
                            amount={reminder.amount}
                          />
                        ) : (
                          <ConfirmPaymentDialog
                            action={reminder.payAction}
                            cards={reminder.cards}
                            label={reminder.label}
                            dueDate={reminder.dueDate}
                            amount={reminder.amount}
                          />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <SectionLabel>Movimentações de hoje</SectionLabel>
            {todaysTransactions.length === 0 ? (
              <EmptyState
                icon={Receipt}
                text="Nenhuma movimentação lançada hoje ainda."
                hint="Toque no + para lançar a primeira."
              />
            ) : (
              <div className="flex flex-col gap-2">
                {todaysTransactions.map((t) => (
                  <MovementRow
                    key={t.id}
                    movement={toMovementValues({
                      id: t.id,
                      kind: "transaction",
                      description: t.description,
                      amount: t.amount,
                      date: t.date,
                      categoryId: t.categoryId,
                    })}
                    cards={cardOptions}
                    categories={categoryOptions}
                  />
                ))}
              </div>
            )}
          </div>

          {tomorrowsTransactions.length > 0 && (
            <div className="flex flex-col gap-3">
              <SectionLabel>Amanhã</SectionLabel>
              <div className="flex flex-col gap-2">
                {tomorrowsTransactions.map((t) => (
                  <MovementRow
                    key={t.id}
                    movement={toMovementValues({
                      id: t.id,
                      kind: "transaction",
                      description: t.description,
                      amount: t.amount,
                      date: t.date,
                      categoryId: t.categoryId,
                    })}
                    cards={cardOptions}
                    categories={categoryOptions}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
