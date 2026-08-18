import { differenceInCalendarDays } from "date-fns";
import { AlertTriangle, ArrowDownLeft, Receipt } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { calculateDailyBudget } from "@/lib/period";
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
import { PeriodCloseCheck } from "@/components/period-close-check";

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export default async function DashboardPage() {
  const userId = await requireUserId();
  const today = new Date();

  const [
    incomes,
    incomeReceipts,
    fixedExpenses,
    creditCards,
    transactions,
    categories,
    expensePayments,
    billEstimates,
  ] = await Promise.all([
      prisma.income.findMany({ where: { userId, active: true } }),
      prisma.incomeReceipt.findMany({ where: { userId } }),
      prisma.fixedExpense.findMany({ where: { userId, active: true } }),
      prisma.creditCard.findMany({ where: { userId, active: true }, include: { purchases: true } }),
      prisma.transaction.findMany({ where: { userId }, orderBy: { date: "desc" } }),
      prisma.category.findMany({ where: { userId, active: true }, orderBy: { name: "asc" } }),
      prisma.expensePayment.findMany({ where: { userId } }),
      prisma.cardBillEstimate.findMany({ where: { userId } }),
    ]);

  const budget = calculateDailyBudget({
    incomes: incomes.map((i) => ({
      id: i.id,
      amount: Number(i.amount),
      dayOfMonth: i.dayOfMonth,
      createdAt: i.createdAt,
    })),
    incomeReceipts: incomeReceipts.map((r) => ({
      incomeId: r.incomeId,
      occurrenceDate: r.occurrenceDate,
      amount: Number(r.amount),
    })),
    fixedExpenses: fixedExpenses.map((e) => ({
      id: e.id,
      amount: Number(e.amount),
      dueDay: e.dueDay ?? undefined,
      createdAt: e.createdAt,
      cardId: e.cardId ?? undefined,
    })),
    creditCards: creditCards.map((c) => ({ id: c.id, closingDay: c.closingDay, dueDay: c.dueDay })),
    cardPurchases: creditCards.flatMap((c) =>
      c.purchases.map((p) => ({
        cardId: c.id,
        amount: Number(p.amount),
        date: p.date,
        installments: p.installments,
      })),
    ),
    billEstimates: billEstimates.map((e) => ({
      cardId: e.cardId,
      dueDate: e.dueDate,
      amount: Number(e.amount),
    })),
    expensePayments: expensePayments.map((p) => ({
      // null vira undefined: period.ts compara os dois lados por igualdade
      // estrita, e null !== undefined faria o pagamento nunca casar.
      fixedExpenseId: p.fixedExpenseId ?? undefined,
      cardId: p.cardId ?? undefined,
      dueDate: p.dueDate,
      amount: Number(p.amount),
    })),
    transactions: transactions.map((t) => ({ amount: Number(t.amount), date: t.date })),
    today,
  });

  const totalDays = differenceInCalendarDays(budget.periodEnd, budget.periodStart);
  const elapsedDays = totalDays - budget.daysRemaining + 1;
  const progressPercent = totalDays > 0 ? Math.min(100, Math.round((elapsedDays / totalDays) * 100)) : 0;

  const todayStart = startOfDay(today);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const todaysTransactions = transactions.filter(
    (t) => startOfDay(t.date).getTime() === todayStart.getTime(),
  );
  const tomorrowsTransactions = transactions
    .filter((t) => startOfDay(t.date).getTime() === tomorrowStart.getTime())
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const isOverBudget = budget.dailyAvailable < 0;

  const cardOptions = creditCards.map((c) => ({ id: c.id, name: c.name }));
  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name }));

  const cardNameById = new Map(creditCards.map((c) => [c.id, c.name]));
  const expenseLabelById = new Map(fixedExpenses.map((e) => [e.id, e.label]));
  const incomeLabelById = new Map(incomes.map((i) => [i.id, i.label]));

  const reminders = [
    ...budget.cardBillReminders.map((bill) => ({
      kind: "due" as const,
      key: `card-${bill.cardId}-${bill.dueDate.toISOString()}`,
      label: `Fatura do ${cardNameById.get(bill.cardId) ?? "cartão"}`,
      amount: bill.amount,
      dueDate: bill.dueDate,
      payAction: markCardBillPaid.bind(null, bill.cardId),
    })),
    ...budget.fixedExpenseReminders.map((exp) => ({
      kind: "due" as const,
      key: `expense-${exp.expenseId}-${exp.dueDate.toISOString()}`,
      label: expenseLabelById.get(exp.expenseId) ?? "Despesa fixa",
      amount: exp.amount,
      dueDate: exp.dueDate,
      payAction: markFixedExpensePaid.bind(null, exp.expenseId),
    })),
    ...budget.incomeReminders.map((inc) => ({
      kind: "income" as const,
      key: `income-${inc.incomeId}-${inc.dueDate.toISOString()}`,
      label: incomeLabelById.get(inc.incomeId) ?? "Receita fixa",
      amount: inc.amount,
      dueDate: inc.dueDate,
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

      <Card variant="elevated">
        {/* Empilhado até `xl`. Só a partir daí os três blocos viram regiões
            lado a lado separadas por divisores verticais — em `lg` a barra de
            sidebar come 240px e sobrariam 200px por região, o que esmaga a
            barra de progresso e quebra os contadores de dia em duas linhas. */}
        <CardContent className="flex flex-col gap-5 py-6 xl:grid xl:grid-cols-[1fr_1fr_16rem] xl:gap-8">
          <div className="flex flex-col gap-1 xl:justify-center">
            <p className="text-sm text-muted-foreground">
              {isOverBudget ? "Você já estourou o orçamento de hoje" : "Você pode gastar hoje"}
            </p>
            <AnimatedCurrency
              value={budget.dailyAvailable}
              className={`font-heading text-[2.75rem] leading-[1.02] font-bold tracking-[-0.03em] tabular-nums lg:text-[3.25rem] ${
                isOverBudget ? "text-negative" : "text-primary"
              }`}
            />
          </div>

          <div className="flex flex-col gap-2 xl:justify-center xl:border-l xl:border-border/60 xl:pl-8">
            <Progress
              value={progressPercent}
              indicatorClassName={isOverBudget ? "bg-negative" : undefined}
            />
            <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
              <span>
                Dia {Math.max(1, elapsedDays)} de {Math.max(1, totalDays)}
              </span>
              <span>
                {budget.daysRemaining}{" "}
                {budget.daysRemaining === 1 ? "dia restante" : "dias restantes"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-border/60 pt-4 xl:grid-cols-1 xl:content-center xl:gap-6 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-8">
            <div className="flex flex-col gap-1">
              <SectionLabel>Saldo do período</SectionLabel>
              <p className="font-medium tabular-nums">{formatCurrency(budget.periodBalance)}</p>
            </div>
            <div className="flex flex-col gap-1">
              <SectionLabel>Recebe em</SectionLabel>
              <p className="font-medium">{formatDate(budget.periodEnd)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

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
                      isIncome ? "before:bg-primary" : "before:bg-negative"
                    }`}
                  >
                    {/* A ação fica numa linha própria no celular: espremida ao
                        lado do texto, ela quebrava o valor em duas linhas. */}
                    <CardContent className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        {isIncome ? (
                          <ArrowDownLeft
                            className="size-4 shrink-0 text-primary"
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
                            {isIncome ? "previsto em" : "vence em"} {formatDate(reminder.dueDate)}
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 [&>button]:w-full sm:[&>button]:w-auto">
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
                      amount: Number(t.amount),
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
                      amount: Number(t.amount),
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
