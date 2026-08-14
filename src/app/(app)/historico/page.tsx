import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { resolveRange, type RangeParams } from "@/lib/date-range";
import { calculateReportTotals } from "@/lib/report-totals";
import { PeriodPicker } from "@/components/period-picker";
import { ReportTotalsCard } from "@/components/report-totals-card";
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
  searchParams: Promise<RangeParams>;
}) {
  const params = await searchParams;
  const userId = await requireUserId();
  const range = resolveRange(params);
  const { rangeStart, rangeEnd } = range;

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

  const totals = calculateReportTotals({ items, rangeStart, rangeEnd, today: new Date() });

  // Mesmo critério que os totais usam: a receita é negativa e cairia num balde
  // de categoria como se fosse gasto, e a fatura paga repetiria compras que já
  // estão listadas uma a uma.
  const countsAsSpending = (item: HistoryItem) =>
    item.amount > 0 && item.kind !== "cardBillPayment";

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
        totals.spent !== 0 ? Math.max(0, Math.round((group.amount / totals.spent) * 100)) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name }));
  const cardOptions = creditCards.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Histórico" />

      {/* O seletor de período é o controle principal desta tela, então ele
          ganha uma superfície própria em vez de flutuar solto sobre o fundo. */}
      <PeriodPicker range={range} />

      <ReportTotalsCard totals={totals} />

      <Tabs defaultValue="lancamentos">
        <TabsList className="w-full lg:w-fit">
          <TabsTrigger value="lancamentos" className="flex-1 lg:flex-none">
            Lançamentos
          </TabsTrigger>
          <TabsTrigger value="categorias" className="flex-1 lg:flex-none">
            Por categoria
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lancamentos" className="grid gap-2 pt-4 xl:grid-cols-2">
          {items.length === 0 ? (
            <EmptyState text="Nenhum lançamento neste período." />
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

        {/* Coluna única de propósito: o acordeão anima a altura ao expandir, e
            em grid isso faria a coluna vizinha pular. */}
        <TabsContent value="categorias" className="pt-4">
          {categoryGroups.length === 0 ? (
            <EmptyState text="Nenhum lançamento neste período." />
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
