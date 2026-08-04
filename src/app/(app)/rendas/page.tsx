import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IncomeFormDialog } from "@/components/forms/income-form-dialog";
import { ExpenseFormDialog } from "@/components/forms/expense-form-dialog";
import { DeleteIconButton } from "@/components/delete-icon-button";
import { ToggleActiveButton } from "@/components/toggle-active-button";
import { deleteIncome, toggleIncomeActive } from "@/lib/actions/income";
import { deleteFixedExpense, toggleFixedExpenseActive } from "@/lib/actions/expense";

export default async function FixedPage() {
  const userId = await requireUserId();

  const [incomes, expenses] = await Promise.all([
    prisma.income.findMany({ where: { userId }, orderBy: { dayOfMonth: "asc" } }),
    prisma.fixedExpense.findMany({ where: { userId }, orderBy: { dueDay: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Rendas e despesas fixas</h1>

      <Tabs defaultValue="rendas">
        <TabsList className="w-full">
          <TabsTrigger value="rendas" className="flex-1">
            Rendas
          </TabsTrigger>
          <TabsTrigger value="despesas" className="flex-1">
            Despesas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rendas" className="flex flex-col gap-4">
          <IncomeFormDialog />
          {incomes.length === 0 ? (
            <EmptyState text="Nenhuma renda cadastrada ainda." />
          ) : (
            <div className="flex flex-col gap-2">
              {incomes.map((income) => (
                <Card key={income.id}>
                  <CardContent className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{income.label}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatCurrency(Number(income.amount))} · todo dia {income.dayOfMonth}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <ToggleActiveButton
                        active={income.active}
                        onToggle={toggleIncomeActive.bind(null, income.id)}
                      />
                      <IncomeFormDialog
                        income={{
                          id: income.id,
                          label: income.label,
                          amount: Number(income.amount),
                          dayOfMonth: income.dayOfMonth,
                        }}
                      />
                      <DeleteIconButton
                        action={deleteIncome.bind(null, income.id)}
                        confirmMessage={`Excluir a renda "${income.label}"?`}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="despesas" className="flex flex-col gap-4">
          <ExpenseFormDialog />
          {expenses.length === 0 ? (
            <EmptyState text="Nenhuma despesa fixa cadastrada ainda." />
          ) : (
            <div className="flex flex-col gap-2">
              {expenses.map((expense) => (
                <Card key={expense.id}>
                  <CardContent className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{expense.label}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatCurrency(Number(expense.amount))} · vence dia {expense.dueDay}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <ToggleActiveButton
                        active={expense.active}
                        onToggle={toggleFixedExpenseActive.bind(null, expense.id)}
                      />
                      <ExpenseFormDialog
                        expense={{
                          id: expense.id,
                          label: expense.label,
                          amount: Number(expense.amount),
                          dueDay: expense.dueDay,
                        }}
                      />
                      <DeleteIconButton
                        action={deleteFixedExpense.bind(null, expense.id)}
                        confirmMessage={`Excluir a despesa "${expense.label}"?`}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
      {text}
    </p>
  );
}
