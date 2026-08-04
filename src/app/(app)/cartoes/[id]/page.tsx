import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { formatCurrency, formatDate } from "@/lib/format";
import { getCardBillsInPeriod } from "@/lib/period";
import { Card, CardContent } from "@/components/ui/card";
import { CardFormDialog } from "@/components/forms/card-form-dialog";
import { CardPurchaseFormDialog } from "@/components/forms/card-purchase-form-dialog";
import { DeleteIconButton } from "@/components/delete-icon-button";
import { deleteCreditCard, deleteCardPurchase } from "@/lib/actions/card";

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();

  const card = await prisma.creditCard.findUnique({
    where: { id, userId },
    include: { purchases: { orderBy: { date: "desc" } } },
  });

  if (!card) notFound();

  const today = new Date();
  const farFuture = new Date(today);
  farFuture.setDate(farFuture.getDate() + 45);

  const purchases = card.purchases.map((p) => ({
    cardId: card.id,
    amount: Number(p.amount),
    date: p.date,
  }));
  const bills = getCardBillsInPeriod([card], purchases, today, farFuture);
  const nextBill = bills.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <Link
          href="/cartoes"
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
          aria-label="Voltar para cartões"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="min-w-0 truncate text-xl font-heading font-semibold">{card.name}</h1>
      </div>

      <Card>
        <CardContent className="flex items-center justify-between gap-3 py-4">
          <div>
            <p className="text-sm text-muted-foreground">
              Fecha dia {card.closingDay} · vence dia {card.dueDay}
            </p>
            {nextBill ? (
              <p className="mt-1 text-lg font-semibold text-negative">
                {formatCurrency(nextBill.amount)}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  vence {formatDate(nextBill.dueDate)}
                </span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Sem fatura em aberto.</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <CardFormDialog card={card} />
            <DeleteIconButton
              action={deleteCreditCard.bind(null, card.id)}
              confirmMessage={`Excluir o cartão "${card.name}" e todas as suas compras?`}
            />
          </div>
        </CardContent>
      </Card>

      <CardPurchaseFormDialog cardId={card.id} />

      {card.purchases.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          Nenhuma compra lançada ainda.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {card.purchases.map((purchase) => (
            <Card key={purchase.id}>
              <CardContent className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{purchase.description}</p>
                  <p className="text-sm text-muted-foreground">{formatDate(purchase.date)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-medium tabular-nums">
                    {formatCurrency(Number(purchase.amount))}
                  </span>
                  <DeleteIconButton
                    action={deleteCardPurchase.bind(null, purchase.id, card.id)}
                    confirmMessage={`Excluir a compra "${purchase.description}"?`}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
