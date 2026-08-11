import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { formatCurrency } from "@/lib/format";
import { parseMonthParam, monthParam, monthLabel, getMonthRange } from "@/lib/month-range";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/page-header";
import { HistoryRow } from "@/components/movement-row";
import { CategoryBreakdown, type CategoryGroup } from "@/components/category-breakdown";
import { historyItemKey, type HistoryItem } from "@/lib/history-item";

const UNCATEGORIZED = "__none__";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const userId = await requireUserId();
  const { year, monthIndex } = parseMonthParam(month);
  const { rangeStart, rangeEnd } = getMonthRange(year, monthIndex);

  const [transactions, cardPurchases, expensePayments, categories, creditCards] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId, date: { gte: rangeStart, lt: rangeEnd } },
      include: { category: { select: { id: true, name: true } } },
    }),
    prisma.cardPurchase.findMany({
      where: { userId, date: { gte: rangeStart, lt: rangeEnd } },
      include: {
        card: { select: { name: true } },
        category: { select: { id: true, name: true } },
      },
    }),
    // Agrupado pela data em que foi pago, não pelo vencimento: pagar antes do
    // vencimento faz o registro cair no mês em que o dinheiro de fato saiu.
    prisma.expensePayment.findMany({
      where: { userId, paidAt: { gte: rangeStart, lt: rangeEnd } },
      include: {
        fixedExpense: {
          select: { label: true, category: { select: { id: true, name: true } } },
        },
        card: { select: { name: true } },
      },
    }),
    prisma.category.findMany({ where: { userId, active: true }, orderBy: { name: "asc" } }),
    prisma.creditCard.findMany({ where: { userId, active: true }, orderBy: { name: "asc" } }),
  ]);

  // O nome vem junto de cada lançamento, e não só da lista de categorias
  // ativas: um lançamento pode apontar para uma categoria já desativada.
  const categoryNameById = new Map<string, string>(categories.map((c) => [c.id, c.name]));
  const rememberCategory = (category: { id: string; name: string } | null | undefined) => {
    if (category) categoryNameById.set(category.id, category.name);
    return category?.id ?? null;
  };

  const items: HistoryItem[] = [
    ...transactions.map((t) => ({
      id: t.id,
      kind: "transaction" as const,
      description: t.description,
      amount: Number(t.amount),
      date: t.date,
      categoryId: rememberCategory(t.category),
    })),
    ...cardPurchases.map((p) => ({
      id: p.id,
      kind: "card" as const,
      description: p.description,
      amount: Number(p.amount),
      date: p.date,
      categoryId: rememberCategory(p.category),
      cardId: p.cardId,
      cardName: p.card.name,
    })),
    ...expensePayments.map((p) => ({
      id: p.id,
      kind: p.cardId ? ("cardBillPayment" as const) : ("fixedExpensePayment" as const),
      description: p.cardId
        ? `Fatura do ${p.card?.name ?? "cartão"}`
        : (p.fixedExpense?.label ?? "Despesa fixa"),
      amount: Number(p.amount),
      date: p.paidAt,
      categoryId: rememberCategory(p.fixedExpense?.category),
      cardId: p.cardId ?? undefined,
      cardName: p.card?.name,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  // Income is stored as a negative amount, so it has to be left out of the
  // spending figures — otherwise it would land in a category bucket as if it
  // were an expense, and cancel out part of the month's total.
  //
  // A fatura de cartão paga também fica de fora: as compras dela já estão
  // listadas uma a uma acima, e somar a fatura contaria o mesmo dinheiro duas
  // vezes. A despesa fixa paga, essa entra — ela não aparece em nenhum outro
  // lugar do Histórico.
  const countsAsSpending = (item: HistoryItem) =>
    item.amount > 0 && item.kind !== "cardBillPayment";

  const expenseTotal = items.filter(countsAsSpending).reduce((sum, i) => sum + i.amount, 0);

  // Agrupado por id, não por nome: nada impede duas categorias homônimas, e
  // fundi-las num balde só esconderia a diferença.
  const byCategory = new Map<string, { amount: number; items: HistoryItem[] }>();
  for (const item of items.filter(countsAsSpending)) {
    const key = item.categoryId ?? UNCATEGORIZED;
    const group = byCategory.get(key) ?? { amount: 0, items: [] };
    group.amount += item.amount;
    group.items.push(item);
    byCategory.set(key, group);
  }

  const categoryGroups: CategoryGroup[] = Array.from(byCategory.entries())
    .map(([key, group]) => ({
      key,
      name: key === UNCATEGORIZED ? "Sem categoria" : (categoryNameById.get(key) ?? "Sem categoria"),
      amount: group.amount,
      items: group.items,
      percent:
        expenseTotal !== 0 ? Math.max(0, Math.round((group.amount / expenseTotal) * 100)) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name }));
  const cardOptions = creditCards.map((c) => ({ id: c.id, name: c.name }));

  const prevMonth = monthIndex === 0 ? { year: year - 1, monthIndex: 11 } : { year, monthIndex: monthIndex - 1 };
  const nextMonth = monthIndex === 11 ? { year: year + 1, monthIndex: 0 } : { year, monthIndex: monthIndex + 1 };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Histórico" />

      {/* O seletor de mês é o controle principal desta tela, então ele ganha
          uma superfície própria em vez de flutuar solto sobre o fundo. */}
      <div className="flex items-center justify-between gap-2 rounded-2xl bg-card p-2 shadow-surface ring-1 ring-foreground/10">
        <Link
          href={`/historico?month=${monthParam(prevMonth.year, prevMonth.monthIndex)}`}
          className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Mês anterior"
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </Link>
        <div className="min-w-0 text-center">
          {/* `capitalize` maiusculiza toda palavra e viraria "Agosto De 2026". */}
          <p className="truncate font-heading font-medium first-letter:uppercase">
            {monthLabel(year, monthIndex)}
          </p>
          <p className="text-sm text-muted-foreground tabular-nums">
            {formatCurrency(expenseTotal)} em gastos
          </p>
        </div>
        <Link
          href={`/historico?month=${monthParam(nextMonth.year, nextMonth.monthIndex)}`}
          className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Próximo mês"
        >
          <ChevronRight className="size-5" aria-hidden="true" />
        </Link>
      </div>

      <Tabs defaultValue="lancamentos">
        <TabsList className="w-full">
          <TabsTrigger value="lancamentos" className="flex-1">
            Lançamentos
          </TabsTrigger>
          <TabsTrigger value="categorias" className="flex-1">
            Por categoria
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lancamentos" className="flex flex-col gap-2 pt-4">
          {items.length === 0 ? (
            <EmptyState text="Nenhum lançamento neste mês." />
          ) : (
            items.map((item) => (
              <HistoryRow
                key={historyItemKey(item)}
                item={item}
                cards={cardOptions}
                categories={categoryOptions}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="categorias" className="pt-4">
          {categoryGroups.length === 0 ? (
            <EmptyState text="Nenhum lançamento neste mês." />
          ) : (
            <CategoryBreakdown
              groups={categoryGroups}
              cards={cardOptions}
              categories={categoryOptions}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
