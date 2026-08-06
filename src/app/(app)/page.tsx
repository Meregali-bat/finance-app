import { differenceInCalendarDays } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { calculateDailyBudget } from "@/lib/period";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { MovementFormDialog } from "@/components/forms/movement-form-dialog";
import { MarkIncomeReceivedDialog } from "@/components/mark-income-received-dialog";
import { DeleteIconButton } from "@/components/delete-icon-button";
import { deleteTransaction } from "@/lib/actions/transaction";
import { PeriodCloseCheck } from "@/components/period-close-check";

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export default async function DashboardPage() {
  const userId = await requireUserId();
  const today = new Date();

  const [incomes, incomeReceipts, fixedExpenses, creditCards, transactions, categories] = await Promise.all([
    prisma.income.findMany({ where: { userId, active: true } }),
    prisma.incomeReceipt.findMany({ where: { userId } }),
    prisma.fixedExpense.findMany({ where: { userId, active: true } }),
    prisma.creditCard.findMany({ where: { userId, active: true }, include: { purchases: true } }),
    prisma.transaction.findMany({ where: { userId }, orderBy: { date: "desc" } }),
    prisma.category.findMany({ where: { userId, active: true }, orderBy: { name: "asc" } }),
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
      c.purchases.map((p) => ({ cardId: c.id, amount: Number(p.amount), date: p.date })),
    ),
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
    })),
    ...budget.fixedExpenseReminders.map((exp) => ({
      kind: "due" as const,
      key: `expense-${exp.expenseId}-${exp.dueDate.toISOString()}`,
      label: expenseLabelById.get(exp.expenseId) ?? "Despesa fixa",
      amount: exp.amount,
      dueDate: exp.dueDate,
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

      <Card className="border-white/5">
        <CardContent className="flex flex-col gap-4 py-6">
          <div>
            <p className="text-sm text-muted-foreground">
              {isOverBudget ? "Você já estourou o orçamento de hoje" : "Você pode gastar hoje"}
            </p>
            <p
              className={`font-heading text-4xl font-bold tabular-nums ${
                isOverBudget ? "text-negative" : "text-primary"
              }`}
            >
              {formatCurrency(budget.dailyAvailable)}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Progress value={progressPercent} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                Dia {Math.max(1, elapsedDays)} de {Math.max(1, totalDays)}
              </span>
              <span>
                {budget.daysRemaining} {budget.daysRemaining === 1 ? "dia restante" : "dias restantes"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
            <div>
              <p className="text-muted-foreground">Saldo do período</p>
              <p className="font-medium tabular-nums">{formatCurrency(budget.periodBalance)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Recebe em</p>
              <p className="font-medium">{formatDate(budget.periodEnd)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {reminders.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Lembretes</h2>
          <div className="flex flex-col gap-2">
            {reminders.map((reminder) =>
              reminder.kind === "income" ? (
                <Card key={reminder.key} className="border-white/5">
                  <CardContent className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm">
                      {reminder.label}: {formatCurrency(reminder.amount)} previsto em{" "}
                      {formatDate(reminder.dueDate)}
                    </p>
                    <MarkIncomeReceivedDialog
                      incomeId={reminder.incomeId}
                      label={reminder.label}
                      dueDate={reminder.dueDate}
                      amount={reminder.amount}
                    />
                  </CardContent>
                </Card>
              ) : (
                <Card key={reminder.key} className="border-white/5">
                  <CardContent className="flex items-center gap-3 py-3">
                    <AlertTriangle className="size-4 shrink-0 text-negative" aria-hidden="true" />
                    <p className="text-sm">
                      {reminder.label}: {formatCurrency(reminder.amount)} vence em{" "}
                      {formatDate(reminder.dueDate)}
                    </p>
                  </CardContent>
                </Card>
              ),
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Movimentações de hoje</h2>
        {todaysTransactions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
            Nenhuma movimentação lançada hoje ainda.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {todaysTransactions.map((t) => (
              <Card key={t.id}>
                <CardContent className="flex items-center justify-between gap-3 py-3">
                  <p className="min-w-0 truncate font-medium">{t.description}</p>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`font-medium tabular-nums ${Number(t.amount) < 0 ? "text-primary" : ""}`}
                    >
                      {formatCurrency(Math.abs(Number(t.amount)))}
                    </span>
                    <DeleteIconButton
                      action={deleteTransaction.bind(null, t.id)}
                      confirmMessage={`Excluir o lançamento "${t.description}"?`}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {tomorrowsTransactions.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Amanhã</h2>
          <div className="flex flex-col gap-2">
            {tomorrowsTransactions.map((t) => (
              <Card key={t.id}>
                <CardContent className="flex items-center justify-between gap-3 py-3">
                  <p className="min-w-0 truncate font-medium">{t.description}</p>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`font-medium tabular-nums ${Number(t.amount) < 0 ? "text-primary" : ""}`}
                    >
                      {formatCurrency(Math.abs(Number(t.amount)))}
                    </span>
                    <DeleteIconButton
                      action={deleteTransaction.bind(null, t.id)}
                      confirmMessage={`Excluir o lançamento "${t.description}"?`}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="fixed bottom-20 right-4 z-10">
        <MovementFormDialog
          cards={creditCards.map((c) => ({ id: c.id, name: c.name }))}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        />
      </div>
    </div>
  );
}
