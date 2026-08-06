import Link from "next/link";
import { ChevronLeft, ChevronRight, CreditCard as CardIcon, Receipt } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { formatCurrency, formatDate } from "@/lib/format";
import { parseMonthParam, monthParam, monthLabel, getMonthRange } from "@/lib/month-range";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DeleteIconButton } from "@/components/delete-icon-button";
import { deleteTransaction } from "@/lib/actions/transaction";
import { deleteCardPurchase } from "@/lib/actions/card";

type HistoryItem = {
  id: string;
  kind: "transaction" | "card";
  description: string;
  amount: number;
  date: Date;
  cardId?: string;
  cardName?: string;
};

type CategoryGroup = {
  key: string;
  name: string;
  amount: number;
  percent: number;
};

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const userId = await requireUserId();
  const { year, monthIndex } = parseMonthParam(month);
  const { rangeStart, rangeEnd } = getMonthRange(year, monthIndex);

  const [transactions, cardPurchases] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId, date: { gte: rangeStart, lt: rangeEnd } },
      include: { category: { select: { name: true } } },
    }),
    prisma.cardPurchase.findMany({
      where: { userId, date: { gte: rangeStart, lt: rangeEnd } },
      include: { card: { select: { name: true } }, category: { select: { name: true } } },
    }),
  ]);

  const items: HistoryItem[] = [
    ...transactions.map((t) => ({
      id: t.id,
      kind: "transaction" as const,
      description: t.description,
      amount: Number(t.amount),
      date: t.date,
    })),
    ...cardPurchases.map((p) => ({
      id: p.id,
      kind: "card" as const,
      description: p.description,
      amount: Number(p.amount),
      date: p.date,
      cardId: p.cardId,
      cardName: p.card.name,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const total = items.reduce((sum, i) => sum + i.amount, 0);

  const categorized = [
    ...transactions.map((t) => ({ amount: Number(t.amount), categoryName: t.category?.name })),
    ...cardPurchases.map((p) => ({ amount: Number(p.amount), categoryName: p.category?.name })),
  ];
  const amountByCategory = new Map<string, number>();
  for (const item of categorized) {
    const key = item.categoryName ?? "Sem categoria";
    amountByCategory.set(key, (amountByCategory.get(key) ?? 0) + item.amount);
  }
  const categoryGroups: CategoryGroup[] = Array.from(amountByCategory.entries())
    .map(([name, amount]) => ({
      key: name,
      name,
      amount,
      percent: total !== 0 ? Math.max(0, Math.round((amount / total) * 100)) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const prevMonth = monthIndex === 0 ? { year: year - 1, monthIndex: 11 } : { year, monthIndex: monthIndex - 1 };
  const nextMonth = monthIndex === 11 ? { year: year + 1, monthIndex: 0 } : { year, monthIndex: monthIndex + 1 };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-heading font-semibold">Histórico</h1>

      <div className="flex items-center justify-between">
        <Link
          href={`/historico?month=${monthParam(prevMonth.year, prevMonth.monthIndex)}`}
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
          aria-label="Mês anterior"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <div className="text-center">
          <p className="font-medium capitalize">{monthLabel(year, monthIndex)}</p>
          <p className="text-sm text-muted-foreground">{formatCurrency(total)}</p>
        </div>
        <Link
          href={`/historico?month=${monthParam(nextMonth.year, nextMonth.monthIndex)}`}
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
          aria-label="Próximo mês"
        >
          <ChevronRight className="size-5" />
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
              <Card key={`${item.kind}-${item.id}`}>
                <CardContent className="flex items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {item.kind === "card" ? (
                      <CardIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    ) : (
                      <Receipt className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.description}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(item.date)}
                        {item.cardName ? ` · ${item.cardName}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`font-medium tabular-nums ${item.amount < 0 ? "text-primary" : ""}`}
                    >
                      {formatCurrency(item.amount)}
                    </span>
                    {item.kind === "transaction" ? (
                      <DeleteIconButton
                        action={deleteTransaction.bind(null, item.id)}
                        confirmMessage={`Excluir o gasto "${item.description}"?`}
                      />
                    ) : (
                      <DeleteIconButton
                        action={deleteCardPurchase.bind(null, item.id, item.cardId!)}
                        confirmMessage={`Excluir a compra "${item.description}"?`}
                      />
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="categorias" className="flex flex-col gap-2 pt-4">
          {categoryGroups.length === 0 ? (
            <EmptyState text="Nenhum lançamento neste mês." />
          ) : (
            categoryGroups.map((group) => (
              <Card key={group.key}>
                <CardContent className="flex flex-col gap-2 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate font-medium">{group.name}</p>
                    <div className="flex shrink-0 items-center gap-2 text-sm">
                      <span className="font-medium tabular-nums">{formatCurrency(group.amount)}</span>
                      <span className="text-muted-foreground tabular-nums">{group.percent}%</span>
                    </div>
                  </div>
                  <Progress value={group.percent} />
                </CardContent>
              </Card>
            ))
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
