import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { formatCurrency } from "@/lib/format";
import { getCardBillsInPeriod } from "@/lib/period";
import { Card, CardContent } from "@/components/ui/card";
import { CardFormDialog } from "@/components/forms/card-form-dialog";

export default async function CardsPage() {
  const userId = await requireUserId();
  const cards = await prisma.creditCard.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    include: { purchases: true },
  });

  const today = new Date();
  const farFuture = new Date(today);
  farFuture.setDate(farFuture.getDate() + 45);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-heading font-semibold">Cartões de crédito</h1>

      <CardFormDialog />

      {cards.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          Nenhum cartão cadastrado ainda.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {cards.map((card) => {
            const purchases = card.purchases.map((p) => ({
              cardId: card.id,
              amount: Number(p.amount),
              date: p.date,
            }));
            const bills = getCardBillsInPeriod([card], purchases, today, farFuture);
            const nextBill = bills.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0];

            return (
              <Link key={card.id} href={`/cartoes/${card.id}`}>
                <Card className="transition-colors hover:bg-accent/40">
                  <CardContent className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{card.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Fecha dia {card.closingDay} · vence dia {card.dueDay}
                      </p>
                      {nextBill && (
                        <p className="mt-1 text-sm text-negative">
                          Próxima fatura: {formatCurrency(nextBill.amount)}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
