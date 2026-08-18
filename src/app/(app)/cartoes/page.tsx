import Link from "next/link";
import { ChevronRight, CreditCard as CardIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { formatCurrency } from "@/lib/format";
import { getCardBillsInPeriod } from "@/lib/period";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/page-header";
import { CardFormDialog } from "@/components/forms/card-form-dialog";

export default async function CardsPage() {
  const userId = await requireUserId();
  const cards = await prisma.creditCard.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    include: { purchases: true, fixedExpenses: { where: { active: true } } },
  });

  const today = new Date();
  const farFuture = new Date(today);
  farFuture.setDate(farFuture.getDate() + 45);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Cartões de crédito" />

      <CardFormDialog />

      {cards.length === 0 ? (
        <EmptyState
          icon={CardIcon}
          text="Nenhum cartão cadastrado ainda."
          hint="Cadastre um para acompanhar a fatura."
        />
      ) : (
        <div className="grid gap-2 xl:grid-cols-2">
          {cards.map((card) => {
            const purchases = card.purchases.map((p) => ({
              cardId: card.id,
              amount: Number(p.amount),
              date: p.date,
            }));
            // As assinaturas cobradas no cartão fazem parte da fatura: sem elas
            // esta tela mostrava um número menor que o do início.
            const cardFixedExpenses = card.fixedExpenses.map((e) => ({
              id: e.id,
              amount: Number(e.amount),
              cardId: e.cardId ?? undefined,
              createdAt: e.createdAt,
            }));
            const bills = getCardBillsInPeriod(
              [card],
              purchases,
              today,
              farFuture,
              cardFixedExpenses,
            );
            const nextBill = bills.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0];

            return (
              // `h-full` porque em grid a linha "Próxima fatura" só aparece em
              // alguns cartões, e sem isso os cards de uma mesma linha ficariam
              // com alturas diferentes.
              <Link key={card.id} href={`/cartoes/${card.id}`} className="h-full">
                <Card variant="interactive" className="h-full">
                  <CardContent className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{card.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Fecha dia {card.closingDay} · vence dia {card.dueDay}
                      </p>
                      {nextBill && (
                        <p className="mt-1.5 text-sm font-medium text-negative tabular-nums">
                          Próxima fatura: {formatCurrency(nextBill.amount)}
                        </p>
                      )}
                    </div>
                    <ChevronRight
                      className="size-5 shrink-0 text-muted-foreground/60 transition-transform duration-150 group-hover/card:translate-x-0.5"
                      aria-hidden="true"
                    />
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
