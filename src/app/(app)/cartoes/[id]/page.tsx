import { notFound } from "next/navigation";
import { Receipt } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { formatCurrency, formatDate, formatDateOnly } from "@/lib/format";
import { getCardBillsInPeriod } from "@/lib/period";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, SectionLabel } from "@/components/page-header";
import { CardFormDialog } from "@/components/forms/card-form-dialog";
import { CardPurchaseFormDialog } from "@/components/forms/card-purchase-form-dialog";
import { MovementRow } from "@/components/movement-row";
import { toMovementValues } from "@/lib/history-item";
import { DeleteIconButton } from "@/components/delete-icon-button";
import { deleteCreditCard } from "@/lib/actions/card";

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();

  const [card, categories] = await Promise.all([
    prisma.creditCard.findUnique({
      where: { id, userId },
      include: { purchases: { orderBy: { date: "desc" } } },
    }),
    prisma.category.findMany({ where: { userId, active: true }, orderBy: { name: "asc" } }),
  ]);

  if (!card) notFound();

  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name }));

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
      <PageHeader
        title={card.name}
        subtitle={`Fecha dia ${card.closingDay} · vence dia ${card.dueDay}`}
        backHref="/cartoes"
        backLabel="Voltar para cartões"
        action={
          <div className="flex items-center gap-1">
            <CardFormDialog card={card} />
            <DeleteIconButton
              action={deleteCreditCard.bind(null, card.id)}
              confirmMessage={`Excluir o cartão "${card.name}" e todas as suas compras?`}
            />
          </div>
        }
      />

      {/* Em telas largas o resumo da fatura fica ao lado da lista em vez de
          empurrá-la para baixo. */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[20rem_1fr] lg:items-start">
        <div className="flex flex-col gap-6">
          <Card variant="elevated">
            <CardContent className="flex flex-col gap-1 py-5">
              <SectionLabel>Próxima fatura</SectionLabel>
              {nextBill ? (
                <>
                  <p className="font-heading text-3xl leading-tight font-bold tracking-[-0.02em] text-negative tabular-nums">
                    {formatCurrency(nextBill.amount)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Vence {formatDate(nextBill.dueDate)}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Sem fatura em aberto.</p>
              )}
            </CardContent>
          </Card>

          <CardPurchaseFormDialog cardId={card.id} categories={categoryOptions} />
        </div>

        {card.purchases.length === 0 ? (
          <EmptyState icon={Receipt} text="Nenhuma compra lançada ainda." />
        ) : (
          <div className="flex flex-col gap-2">
            {card.purchases.map((purchase) => (
              <MovementRow
                key={purchase.id}
                movement={toMovementValues({
                  id: purchase.id,
                  kind: "card",
                  description: purchase.description,
                  amount: Number(purchase.amount),
                  date: purchase.date,
                  categoryId: purchase.categoryId,
                  cardId: card.id,
                })}
                subtitle={formatDateOnly(purchase.date)}
                cards={[{ id: card.id, name: card.name }]}
                categories={categoryOptions}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
