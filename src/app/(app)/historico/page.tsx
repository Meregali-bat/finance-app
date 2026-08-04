import Link from "next/link";
import { ChevronLeft, ChevronRight, CreditCard as CardIcon, Receipt } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteIconButton } from "@/components/delete-icon-button";
import { deleteTransaction } from "@/lib/actions/transaction";
import { deleteCardPurchase } from "@/lib/actions/card";

function parseMonthParam(month: string | undefined): { year: number; monthIndex: number } {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [year, m] = month.split("-").map(Number);
    return { year, monthIndex: m - 1 };
  }
  const now = new Date();
  return { year: now.getFullYear(), monthIndex: now.getMonth() };
}

function monthParam(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function monthLabel(year: number, monthIndex: number) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    new Date(year, monthIndex, 1),
  );
}

type HistoryItem = {
  id: string;
  kind: "transaction" | "card";
  description: string;
  amount: number;
  date: Date;
  cardId?: string;
  cardName?: string;
};

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const userId = await requireUserId();
  const { year, monthIndex } = parseMonthParam(month);

  const rangeStart = new Date(year, monthIndex, 1);
  const rangeEnd = new Date(year, monthIndex + 1, 1);

  const [transactions, cardPurchases] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId, date: { gte: rangeStart, lt: rangeEnd } },
    }),
    prisma.cardPurchase.findMany({
      where: { userId, date: { gte: rangeStart, lt: rangeEnd } },
      include: { card: { select: { name: true } } },
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

  const prevMonth = monthIndex === 0 ? { year: year - 1, monthIndex: 11 } : { year, monthIndex: monthIndex - 1 };
  const nextMonth = monthIndex === 11 ? { year: year + 1, monthIndex: 0 } : { year, monthIndex: monthIndex + 1 };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Histórico</h1>

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

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          Nenhum lançamento neste mês.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
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
          ))}
        </div>
      )}
    </div>
  );
}
