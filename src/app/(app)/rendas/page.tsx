import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { installmentsLeft } from "@/lib/period";
import { EmptyState } from "@/components/ui/empty-state";
import { FixedTabs, type FixedTab } from "@/components/fixed-tabs";
import { ListRow, stagger } from "@/components/list-row";
import { IncomeFormDialog } from "@/components/forms/income-form-dialog";
import { ExpenseFormDialog } from "@/components/forms/expense-form-dialog";
import { CategoryFormDialog } from "@/components/forms/category-form-dialog";
import { DeleteIconButton } from "@/components/delete-icon-button";
import { ToggleActiveButton } from "@/components/toggle-active-button";
import { deleteIncome, toggleIncomeActive } from "@/lib/actions/income";
import {
  deleteFixedExpense,
  toggleFixedExpenseActive,
  undoExpenseDeferral,
} from "@/lib/actions/expense";
import { UndoDeferralButton } from "@/components/undo-deferral-button";
import { deleteCategory, toggleCategoryActive } from "@/lib/actions/category";

const FIXED_TABS: readonly FixedTab[] = ["rendas", "despesas", "categorias"];

/** `?aba=despesas` abre direto na aba; qualquer outra coisa, em Rendas. */
function resolveTab(param: string | string[] | undefined): FixedTab {
  const raw = Array.isArray(param) ? param[0] : param;
  return FIXED_TABS.find((tab) => tab === raw) ?? "rendas";
}

export default async function FixedPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string | string[] }>;
}) {
  const userId = await requireUserId();
  const { aba } = await searchParams;
  const today = new Date();

  const [incomes, expenses, creditCards, categories] = await Promise.all([
    prisma.income.findMany({ where: { userId, deletedAt: null }, orderBy: { dayOfMonth: "asc" } }),
    // As apagadas ficam no banco para o Histórico, mas não na lista.
    prisma.fixedExpense.findMany({
      where: { userId, deletedAt: null },
      orderBy: { dueDay: "asc" },
      include: {
        deferrals: { orderBy: { dueDate: "asc" } },
        // Os pagos de agora para a frente: a parcela adiantada já não falta.
        payments: {
          where: { settled: true, dueDate: { gte: new Date(today.getTime() - 40 * 86_400_000) } },
          select: { dueDate: true },
        },
      },
    }),
    prisma.creditCard.findMany({ where: { userId, active: true, deletedAt: null } }),
    prisma.category.findMany({ where: { userId }, orderBy: { name: "asc" } }),
  ]);

  const cards = creditCards.map((c) => ({ id: c.id, name: c.name }));
  // A aba Categorias lista todas para gerenciar; os formulários só oferecem as ativas.
  const activeCategories = categories
    .filter((c) => c.active)
    .map((c) => ({ id: c.id, name: c.name }));
  const cardNameById = new Map(cards.map((c) => [c.id, c.name]));

  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      <FixedTabs
        initialTab={resolveTab(aba)}
        actions={{
          rendas: <IncomeFormDialog />,
          despesas: <ExpenseFormDialog cards={cards} categories={activeCategories} />,
          categorias: <CategoryFormDialog />,
        }}
        panels={{
          rendas:
            incomes.length === 0 ? (
              <EmptyState text="Nenhuma renda cadastrada ainda." hint="Use o + para cadastrar." />
            ) : (
              <ul className="grid gap-2 xl:grid-cols-2">
                {incomes.map((income, index) => (
                  <li key={income.id} className="rise-in" style={stagger(index, 80, 45)}>
                    <ListRow
                      dim={!income.active}
                      title={income.label}
                      subtitle={`${formatCurrency(Number(income.amount))} · todo dia ${income.dayOfMonth}`}
                      trailing={
                        <>
                          <ToggleActiveButton
                            active={income.active}
                            label={`${income.active ? "Desativar" : "Ativar"} ${income.label}`}
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
                        </>
                      }
                    />
                  </li>
                ))}
              </ul>
            ),
          despesas:
            expenses.length === 0 ? (
              <EmptyState
                text="Nenhuma despesa fixa cadastrada ainda."
                hint="Use o + para cadastrar."
              />
            ) : (
              <ul className="grid items-start gap-2 xl:grid-cols-2">
                {expenses.map((expense, index) => {
                  const cardName = expense.cardId ? cardNameById.get(expense.cardId) : undefined;
                  // Quantas faltam, e não o número salvo: é o que a pessoa
                  // confere com o carnê, e o que o formulário edita.
                  const left = installmentsLeft(
                    {
                      dueDay: expense.dueDay ?? undefined,
                      createdAt: expense.createdAt,
                      installmentCount: expense.installmentCount ?? undefined,
                      installmentsFrom: expense.installmentsFrom ?? undefined,
                    },
                    today,
                    expense.payments.map((p) => p.dueDate),
                  );
                  return (
                    <li key={expense.id} className="rise-in" style={stagger(index, 80, 45)}>
                      <ListRow
                        dim={!expense.active}
                        title={expense.label}
                        subtitle={[
                          formatCurrency(Number(expense.amount)),
                          cardName ?? `vence dia ${expense.dueDay}`,
                          left &&
                            (left.remaining === 0
                              ? "parcelas encerradas"
                              : `${left.remaining === 1 ? "falta 1 parcela" : `faltam ${left.remaining} parcelas`} · última em ${formatShortDate(left.last)}`),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        trailing={
                          <>
                            <ToggleActiveButton
                              active={expense.active}
                              label={`${expense.active ? "Desativar" : "Ativar"} ${expense.label}`}
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
                                installmentCount: left ? left.remaining : expense.installmentCount,
                              }}
                              cards={cards}
                              categories={activeCategories}
                            />
                            <DeleteIconButton
                              action={deleteFixedExpense.bind(null, expense.id)}
                              confirmMessage={`Excluir a despesa "${expense.label}"? Ela para de ser cobrada daqui para frente; os meses em que já foi cobrada continuam no Histórico.`}
                            />
                          </>
                        }
                      >
                        {/* Um adiamento não é dinheiro e não aparece no
                            Histórico; é aqui que ele se vê e se desfaz. */}
                        {expense.deferrals.map((deferral) => (
                          <div
                            key={deferral.id}
                            className="flex items-center justify-between gap-2 rounded-xl bg-muted py-1 pr-1 pl-3 text-xs text-muted-foreground"
                          >
                            <span className="tabular-nums">
                              Adiada: {formatShortDate(deferral.dueDate, "UTC")} →{" "}
                              {formatShortDate(deferral.targetDueDate)} (
                              {formatCurrency(Number(deferral.amount))}
                              {deferral.mode === "end" ? ", depois da última" : ""})
                            </span>
                            <UndoDeferralButton
                              action={undoExpenseDeferral.bind(null, deferral.id)}
                            />
                          </div>
                        ))}
                      </ListRow>
                    </li>
                  );
                })}
              </ul>
            ),
          categorias:
            categories.length === 0 ? (
              <EmptyState
                text="Nenhuma categoria cadastrada ainda."
                hint="Use o + para cadastrar."
              />
            ) : (
              <ul className="grid gap-2 xl:grid-cols-2">
                {categories.map((category, index) => (
                  <li key={category.id} className="rise-in" style={stagger(index, 80, 45)}>
                    <ListRow
                      dim={!category.active}
                      title={category.name}
                      trailing={
                        <>
                          <ToggleActiveButton
                            active={category.active}
                            label={`${category.active ? "Desativar" : "Ativar"} ${category.name}`}
                            onToggle={toggleCategoryActive.bind(null, category.id)}
                          />
                          <CategoryFormDialog category={{ id: category.id, name: category.name }} />
                          <DeleteIconButton
                            action={deleteCategory.bind(null, category.id)}
                            confirmMessage={`Excluir a categoria "${category.name}"?`}
                          />
                        </>
                      }
                    />
                  </li>
                ))}
              </ul>
            ),
        }}
      />
    </div>
  );
}
