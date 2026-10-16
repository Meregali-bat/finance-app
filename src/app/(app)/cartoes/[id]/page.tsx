import { notFound } from "next/navigation";
import { CreditCard, Receipt } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { formatCurrency, formatDate, formatDateTime, installmentLabel } from "@/lib/format";
import { toFixedExpenseInput } from "@/lib/budget-inputs";
import { buildCardBillSeries, findNextOpenBill, getCardLimitUsage } from "@/lib/period";
import { stagger } from "@/components/list-row";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, SectionLabel } from "@/components/page-header";
import { CardFormDialog } from "@/components/forms/card-form-dialog";
import { CardPurchaseFormDialog } from "@/components/forms/card-purchase-form-dialog";
import { CardBillEstimateDialog } from "@/components/forms/card-bill-estimate-dialog";
import { CardBillProjection } from "@/components/card-bill-projection";
import { MovementRow } from "@/components/movement-row";
import { toMovementValues } from "@/lib/history-item";
import { DeleteIconButton } from "@/components/delete-icon-button";
import { deleteCreditCard } from "@/lib/actions/card";

export default async function CardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId();

  const [card, categories] = await Promise.all([
    prisma.creditCard.findUnique({
      where: { id, userId, deletedAt: null },
      include: {
        purchases: { orderBy: { date: "desc" } },
        // Todas, e não só as ativas: são as datas (cadastro, pausas, encerramento)
        // que dizem em quais faturas a assinatura entra — a mesma regra da Início.
        fixedExpenses: { include: { pauses: true } },
        billEstimates: { orderBy: { dueDate: "asc" } },
        payments: true,
      },
    }),
    prisma.category.findMany({ where: { userId, active: true }, orderBy: { name: "asc" } }),
  ]);

  if (!card) notFound();

  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name }));

  const today = new Date();

  const purchases = card.purchases.map((p) => ({
    cardId: card.id,
    amount: Number(p.amount),
    date: p.date,
    installments: p.installments,
  }));
  const billEstimates = card.billEstimates.map((e) => ({
    cardId: e.cardId,
    dueDate: e.dueDate,
    amount: Number(e.amount),
  }));
  // As assinaturas cobradas no cartão fazem parte da fatura: sem elas esta tela
  // mostrava um número menor que o do início.
  const cardFixedExpenses = card.fixedExpenses.map(toFixedExpenseInput);
  const expensePayments = card.payments.map((p) => ({
    cardId: p.cardId ?? undefined,
    dueDate: p.dueDate,
    amount: Number(p.amount),
  }));
  const limitUsage = getCardLimitUsage({
    card: {
      id: card.id,
      closingDay: card.closingDay,
      dueDay: card.dueDay,
      creditLimit: card.creditLimit ? Number(card.creditLimit) : undefined,
    },
    purchases,
    cardFixedExpenses,
    billEstimates,
    expensePayments,
    today,
  });

  // Seis faturas: cabe na tela do celular sem rolar muito e cobre a maioria dos
  // parcelamentos curtos. A série é montada uma vez e alimenta tanto a "próxima
  // fatura" quanto a projeção — antes eram duas contas, e a de cima ignorava os
  // pagamentos, então anunciava como próxima uma fatura que a de baixo já
  // marcava como paga. Vem de buildCardBillSeries para a fatura que venceu e
  // não foi paga continuar aparecendo, em vez de existir só como o aviso de
  // "fatura vencida" do card de limite ao lado.
  const cardBills = buildCardBillSeries({
    card: { id: card.id, closingDay: card.closingDay, dueDay: card.dueDay },
    purchases,
    cardFixedExpenses,
    billEstimates,
    expensePayments,
    today,
    months: 6,
  });
  const nextBill = findNextOpenBill(cardBills);
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const projectedBills = cardBills.map((bill) => ({
    dueDateIso: bill.dueDate.toISOString(),
    dueDate: bill.dueDate,
    amount: bill.amount,
    estimateAmount: bill.estimateAmount,
    paid: bill.paid,
    paidAmount: bill.paidAmount,
    // Calculado aqui, não no cliente: refazer a conta no navegador a leria em
    // outro fuso, o mesmo motivo pelo qual date-range.ts resolve as setas no
    // servidor.
    overdue: bill.dueDate.getTime() < todayStart.getTime(),
  }));

  // O seletor do formulário só oferece vencimentos de verdade: uma data
  // qualquer não casaria com fatura alguma e a previsão sumiria em silêncio.
  const dueDateOptions = projectedBills.map((bill) => ({
    value: bill.dueDateIso,
    label: formatDate(bill.dueDate),
  }));

  const listedEstimates = card.billEstimates.map((e) => ({
    id: e.id,
    description: e.description,
    dueDate: e.dueDate,
    amount: Number(e.amount),
  }));

  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      <PageHeader
        title={card.name}
        subtitle={`Fecha dia ${card.closingDay} · vence dia ${card.dueDay}`}
        backHref="/cartoes"
        backLabel="Voltar para cartões"
        action={
          <>
            {/* Só os campos do formulário: o objeto do Prisma carrega as
                compras com `amount` em Decimal, e Decimal não atravessa a
                fronteira para um client component. */}
            <CardFormDialog
              card={{
                id: card.id,
                name: card.name,
                closingDay: card.closingDay,
                dueDay: card.dueDay,
                creditLimit: card.creditLimit ? Number(card.creditLimit) : undefined,
              }}
            />
            <DeleteIconButton
              action={deleteCreditCard.bind(null, card.id)}
              confirmMessage={`Excluir o cartão "${card.name}"? As compras e faturas dele continuam no Histórico, e as parcelas que faltam continuam na previsão.`}
            />
          </>
        }
      />

      <div
        className="rise-in grid grid-cols-2 gap-2.5 lg:gap-4"
        style={{ "--rise-delay": "80ms" } as React.CSSProperties}
      >
        <div className="flex min-w-0 flex-col gap-1 rounded-[20px] bg-muted p-4 shadow-(--shadow-card) lg:p-5">
          <SectionLabel>Próxima fatura</SectionLabel>
          {nextBill ? (
            <>
              <p className="truncate font-heading text-[23px] leading-tight font-bold tracking-[-0.03em] text-negative tabular-nums lg:text-[28px]">
                {formatCurrency(nextBill.amount)}
              </p>
              <p className="text-[12.5px] text-muted-foreground">
                {nextBill.dueDate.getTime() < todayStart.getTime() ? "Venceu" : "Vence"}{" "}
                {formatDate(nextBill.dueDate)}
              </p>
            </>
          ) : (
            <p className="text-[13px] text-muted-foreground">Sem fatura em aberto.</p>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-1 rounded-[20px] bg-muted p-4 shadow-(--shadow-card) lg:p-5">
          <SectionLabel>Limite usado</SectionLabel>
          {limitUsage ? (
            <>
              {/* Neutro, não text-negative: dinheiro comprometido não é
                  prejuízo, é limite ocupado. */}
              <p className="truncate font-heading text-[23px] leading-tight font-bold tracking-[-0.03em] tabular-nums lg:text-[28px]">
                {formatCurrency(limitUsage.used)}
              </p>
              <span
                aria-hidden="true"
                className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/30"
              >
                <span
                  className={`grow-right block h-full rounded-full ${
                    limitUsage.percentUsed >= 90 ? "bg-negative" : "bg-primary"
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, limitUsage.percentUsed))}%` }}
                />
              </span>
              <p
                className="text-[12px] text-muted-foreground tabular-nums"
                title="Considera as faturas em aberto dos últimos 3 meses e as parcelas futuras."
              >
                {formatCurrency(limitUsage.available)} de {formatCurrency(limitUsage.limit)} livres
              </p>
              {limitUsage.overdueBillCount > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {limitUsage.overdueBillCount === 1
                    ? "1 fatura vencida ainda não marcada como paga."
                    : `${limitUsage.overdueBillCount} faturas vencidas ainda não marcadas como pagas.`}
                </p>
              )}
            </>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              Informe o limite no lápis acima para acompanhar quanto já está comprometido.
            </p>
          )}
        </div>
      </div>

      <div
        className="rise-in flex items-center gap-2.5 lg:max-w-md"
        style={{ "--rise-delay": "140ms" } as React.CSSProperties}
      >
        <CardPurchaseFormDialog cardId={card.id} categories={categoryOptions} />
        <CardBillEstimateDialog cardId={card.id} dueDates={dueDateOptions} />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <CardBillProjection cardId={card.id} bills={projectedBills} estimates={listedEstimates} />

        <div className="flex flex-col gap-2 xl:pt-0">
          <SectionLabel>Compras</SectionLabel>
          {card.purchases.length === 0 ? (
            <EmptyState icon={Receipt} text="Nenhuma compra lançada ainda." />
          ) : (
            <ul className="flex flex-col gap-2">
              {card.purchases.map((purchase, index) => (
                <li key={purchase.id} className="rise-in" style={stagger(Math.min(index, 10), 260)}>
                  <MovementRow
                    icon={<CreditCard />}
                    movement={toMovementValues({
                      id: purchase.id,
                      kind: "card",
                      description: purchase.description,
                      amount: Number(purchase.amount),
                      date: purchase.date,
                      categoryId: purchase.categoryId,
                      cardId: card.id,
                      installments: purchase.installments,
                    })}
                    subtitle={[
                      formatDateTime(purchase.date, purchase.createdAt),
                      // O valor da linha é o total da compra; sem isto um 12x se
                      // leria como se tudo tivesse saído no mês em que foi comprado.
                      installmentLabel(Number(purchase.amount), purchase.installments),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    cards={[{ id: card.id, name: card.name }]}
                    categories={categoryOptions}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
