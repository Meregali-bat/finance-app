import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IncomeFormDialog } from "@/components/forms/income-form-dialog";
import { ExpenseFormDialog } from "@/components/forms/expense-form-dialog";
import { CategoryFormDialog } from "@/components/forms/category-form-dialog";
import { DeleteIconButton } from "@/components/delete-icon-button";
import { ToggleActiveButton } from "@/components/toggle-active-button";
import { deleteIncome, toggleIncomeActive } from "@/lib/actions/income";
import { deleteFixedExpense, toggleFixedExpenseActive } from "@/lib/actions/expense";
import { deleteCategory, toggleCategoryActive } from "@/lib/actions/category";

export default async function FixedPage() {
  const userId = await requireUserId();

  const [incomes, expenses, creditCards, categories] = await Promise.all([
    prisma.income.findMany({ where: { userId, deletedAt: null }, orderBy: { dayOfMonth: "asc" } }),
    // As apagadas ficam no banco para o Histórico, mas não na lista.
    prisma.fixedExpense.findMany({
      where: { userId, deletedAt: null },
      orderBy: { dueDay: "asc" },
    }),
    prisma.creditCard.findMany({ where: { userId, active: true, deletedAt: null } }),
    prisma.category.findMany({ where: { userId }, orderBy: { name: "asc" } }),
  ]);

  const cards = creditCards.map((c) => ({ id: c.id, name: c.name }));
  // A aba Categorias lista todas para gerenciar; os formulários só oferecem as ativas.
  const activeCategories = categories.filter((c) => c.active).map((c) => ({ id: c.id, name: c.name }));
  const cardNameById = new Map(cards.map((c) => [c.id, c.name]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Rendas e despesas fixas"
        subtitle="O que se repete todo mês"
      />

      <Tabs defaultValue="rendas">
        {/* As abas ocupam a largura toda no celular; em telas largas voltam ao
            tamanho do conteúdo, senão viram três faixas gigantes. */}
        <TabsList className="w-full lg:w-fit">
          <TabsTrigger value="rendas" className="flex-1 lg:flex-none">
            Rendas
          </TabsTrigger>
          <TabsTrigger value="despesas" className="flex-1 lg:flex-none">
            Despesas
          </TabsTrigger>
          <TabsTrigger value="categorias" className="flex-1 lg:flex-none">
            Categorias
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rendas" className="flex flex-col gap-4">
          <IncomeFormDialog />
          {incomes.length === 0 ? (
            <EmptyState text="Nenhuma renda cadastrada ainda." />
          ) : (
            <div className="grid gap-2 xl:grid-cols-2">
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
                        confirmMessage={`Excluir a renda "${income.label}"? Ela deixa de ser prevista; o que ela já pagou continua no Histórico e no saldo.`}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="despesas" className="flex flex-col gap-4">
          <ExpenseFormDialog cards={cards} categories={activeCategories} />
          {expenses.length === 0 ? (
            <EmptyState text="Nenhuma despesa fixa cadastrada ainda." />
          ) : (
            <div className="grid gap-2 xl:grid-cols-2">
              {expenses.map((expense) => {
                const cardName = expense.cardId ? cardNameById.get(expense.cardId) : undefined;
                return (
                  <Card key={expense.id}>
                    <CardContent className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{expense.label}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatCurrency(Number(expense.amount))}
                          {cardName
                            ? ` · ${cardName}`
                            : ` · vence dia ${expense.dueDay}`}
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
                            cardId: expense.cardId,
                            categoryId: expense.categoryId,
                          }}
                          cards={cards}
                          categories={activeCategories}
                        />
                        <DeleteIconButton
                          action={deleteFixedExpense.bind(null, expense.id)}
                          confirmMessage={`Excluir a despesa "${expense.label}"? Ela para de ser cobrada daqui para frente; os meses em que já foi cobrada continuam no Histórico.`}
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="categorias" className="flex flex-col gap-4">
          <CategoryFormDialog />
          {categories.length === 0 ? (
            <EmptyState text="Nenhuma categoria cadastrada ainda." />
          ) : (
            <div className="grid gap-2 xl:grid-cols-2">
              {categories.map((category) => (
                <Card key={category.id}>
                  <CardContent className="flex items-center justify-between gap-3 py-3">
                    <p className="min-w-0 truncate font-medium">{category.name}</p>
                    <div className="flex shrink-0 items-center gap-1">
                      <ToggleActiveButton
                        active={category.active}
                        onToggle={toggleCategoryActive.bind(null, category.id)}
                      />
                      <CategoryFormDialog category={{ id: category.id, name: category.name }} />
                      <DeleteIconButton
                        action={deleteCategory.bind(null, category.id)}
                        confirmMessage={`Excluir a categoria "${category.name}"?`}
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
