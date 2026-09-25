import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { resolveRange, type RangeParams } from "@/lib/date-range";
import { calculateReportTotals, countsAsSpending } from "@/lib/report-totals";
import { PeriodPicker } from "@/components/period-picker";
import { ReportTotalsCard } from "@/components/report-totals-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/page-header";
import { HistoryRow } from "@/components/movement-row";
import { CategoryBreakdown, type CategoryGroup } from "@/components/category-breakdown";
import { historyItemKey, type HistoryItem } from "@/lib/history-item";
import { billLinesInRange } from "@/lib/history-bills";
import { toFixedExpenseInput } from "@/lib/budget-inputs";

const UNCATEGORIZED = "__none__";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<RangeParams>;
}) {
  const params = await searchParams;
  const userId = await requireUserId();
  const range = resolveRange(params);
  // Duas bordas para duas convenções de gravação: lançamentos guardam um dia
  // do calendário em meia-noite UTC, confirmações guardam instantes locais.
  const { rangeStart, rangeEnd, utcRangeStart, utcRangeEnd } = range;

  const [transactions, expensePayments, incomeReceipts, categories, creditCards, jarDeposits] =
    await Promise.all([
      // Sem as linhas do fechamento de período antigo: eram a sobra do mês
      // anterior devolvida ao orçamento, e o total de recebido as lia como renda
      // nova — o mesmo salário contado duas vezes.
      prisma.transaction.findMany({
        where: { userId, fromPeriodClose: false, date: { gte: utcRangeStart, lt: utcRangeEnd } },
        include: { category: { select: { id: true, name: true } } },
      }),
      // Agrupado pela data em que foi pago, não pelo vencimento: pagar antes do
      // vencimento faz o registro cair no mês em que o dinheiro de fato saiu.
      // Sem os pagos no cartão: valem 0, e quem mostra o gasto é a compra.
      prisma.expensePayment.findMany({
        where: { userId, cardPurchaseId: null, paidAt: { gte: rangeStart, lt: rangeEnd } },
        include: {
          fixedExpense: {
            select: { label: true, category: { select: { id: true, name: true } } },
          },
          card: { select: { name: true } },
        },
      }),
      // Agrupado pelo dia do pagamento — é quando o dinheiro entrou. Não existe
      // "recebido em" separado: confirmar é dizer que aquele pagamento chegou.
      prisma.incomeReceipt.findMany({
        where: { userId, occurrenceDate: { gte: rangeStart, lt: rangeEnd } },
        include: { income: { select: { label: true } } },
      }),
      prisma.category.findMany({ where: { userId, active: true }, orderBy: { name: "asc" } }),
      // Todos os cartões, inclusive os desativados e apagados, com tudo o que
      // forma uma fatura: o histórico de um cartão não pode sumir com ele.
      prisma.creditCard.findMany({
        where: { userId },
        orderBy: { name: "asc" },
        include: {
          purchases: { include: { category: { select: { id: true, name: true } } } },
          fixedExpenses: {
            include: { pauses: true, category: { select: { id: true, name: true } } },
          },
          billEstimates: true,
          payments: true,
        },
      }),
      prisma.jarDeposit.findMany({
        where: { userId, createdAt: { gte: rangeStart, lt: rangeEnd } },
        include: { jar: { select: { name: true } } },
      }),
    ]);

  // O nome vem junto de cada lançamento, e não só da lista de categorias
  // ativas: um lançamento pode apontar para uma categoria já desativada.
  const categoryNameById = new Map<string, string>(categories.map((c) => [c.id, c.name]));
  const rememberCategory = (category: { id: string; name: string } | null | undefined) => {
    if (category) categoryNameById.set(category.id, category.name);
    return category?.id ?? null;
  };

  /**
   * O cartão entra pelas faturas que vencem no intervalo, aberta cada uma nas
   * linhas que a compõem — o mesmo mês em que o orçamento e a previsão contam
   * cada parcela. Antes a compra entrava inteira no dia em que foi feita, e o
   * Histórico de um mês nunca batia com o que o orçamento dele descontava.
   */
  const cardItems: HistoryItem[] = creditCards.flatMap((card) => {
    const purchaseById = new Map(card.purchases.map((p) => [p.id, p]));
    const expenseById = new Map(card.fixedExpenses.map((e) => [e.id, e]));
    const estimateById = new Map(card.billEstimates.map((e) => [e.id, e]));

    const lines = billLinesInRange({
      card: { id: card.id, closingDay: card.closingDay, dueDay: card.dueDay },
      purchases: card.purchases.map((p) => ({
        id: p.id,
        cardId: card.id,
        amount: Number(p.amount),
        date: p.date,
        installments: p.installments,
      })),
      cardFixedExpenses: card.fixedExpenses.map(toFixedExpenseInput),
      billEstimates: card.billEstimates.map((e) => ({
        id: e.id,
        cardId: card.id,
        dueDate: e.dueDate,
        amount: Number(e.amount),
      })),
      expensePayments: card.payments.map((p) => ({
        cardId: p.cardId ?? undefined,
        dueDate: p.dueDate,
        amount: Number(p.amount),
      })),
      start: rangeStart,
      end: rangeEnd,
    });

    const onCard = { cardId: card.id, cardName: card.name };
    return lines.map((line): HistoryItem => {
      switch (line.kind) {
        case "installment": {
          const purchase = purchaseById.get(line.purchaseId)!;
          return {
            ...onCard,
            id: purchase.id,
            kind: "card",
            description: purchase.description,
            amount: line.amount,
            date: line.dueDate,
            createdAt: purchase.createdAt,
            categoryId: rememberCategory(purchase.category),
            installments: purchase.installments,
            installmentNumber: line.installmentNumber,
            purchaseAmount: Number(purchase.amount),
            purchaseDate: purchase.date,
          };
        }
        case "subscription": {
          const expense = expenseById.get(line.fixedExpenseId)!;
          return {
            ...onCard,
            // Derivada da fatura: o id diz de qual fatura, senão se repetiria
            // em todo mês.
            id: `${card.id}-${line.dueDate.toISOString()}-${expense.id}`,
            kind: "cardFixedExpense",
            description: expense.label,
            amount: line.amount,
            date: line.dueDate,
            categoryId: rememberCategory(expense.category),
          };
        }
        case "estimate": {
          const estimate = estimateById.get(line.estimateId)!;
          return {
            ...onCard,
            id: estimate.id,
            kind: "cardEstimate",
            description: estimate.description,
            amount: line.amount,
            date: line.dueDate,
            categoryId: null,
          };
        }
        case "adjustment":
          return {
            ...onCard,
            id: `${card.id}-${line.dueDate.toISOString()}-adjustment`,
            kind: "cardBillAdjustment",
            description: `Diferença na fatura do ${card.name}`,
            amount: line.amount,
            date: line.dueDate,
            categoryId: null,
          };
      }
    });
  });

  const items: HistoryItem[] = [
    ...transactions.map((t) => ({
      id: t.id,
      kind: "transaction" as const,
      description: t.description,
      amount: Number(t.amount),
      date: t.date,
      createdAt: t.createdAt,
      categoryId: rememberCategory(t.category),
    })),
    ...cardItems,
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
    // Negativo porque é receita, que é como o HistoryItem marca dinheiro que
    // entra — é assim que o total de recebido enxerga a receita fixa.
    ...incomeReceipts.map((r) => ({
      id: r.id,
      kind: "incomeReceipt" as const,
      description: r.income.label,
      amount: -Number(r.amount),
      date: r.occurrenceDate,
      categoryId: null,
      incomeId: r.incomeId,
    })),
    // O dinheiro que foi para as caixinhas ou voltou delas. O orçamento já o
    // tirava do disponível; sem ele aqui, o saldo do mês no Histórico nunca
    // batia com o da Início.
    ...jarDeposits.map((d) => ({
      id: d.id,
      kind: "jarDeposit" as const,
      description:
        Number(d.amount) < 0 ? `Resgate de "${d.jar.name}"` : `Guardado em "${d.jar.name}"`,
      amount: Number(d.amount),
      date: d.createdAt,
      categoryId: null,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const totals = calculateReportTotals({ items, rangeStart, rangeEnd, today: new Date() });

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
  const cardOptions = creditCards
    .filter((c) => c.active)
    .map((c) => ({ id: c.id, name: c.name }));

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
