import Link from "next/link";
import { ChevronRight, CreditCard as CardIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { formatCurrency } from "@/lib/format";
import { toFixedExpenseInput } from "@/lib/budget-inputs";
import { buildCardBillSeries, findNextOpenBill, getCardLimitUsage } from "@/lib/period";
import { SectionLabel } from "@/components/page-header";
import { stagger } from "@/components/list-row";
import { cardGradient } from "@/lib/card-look";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/page-header";
import { CardFormDialog } from "@/components/forms/card-form-dialog";

export default async function CardsPage() {
  const userId = await requireUserId();
  const cards = await prisma.creditCard.findMany({
    where: { userId, deletedAt: null },
    orderBy: { name: "asc" },
    include: {
      purchases: true,
      // Todas, e não só as ativas: são as datas (cadastro, pausas, encerramento)
      // que dizem em quais faturas a assinatura entra — a mesma regra da Início.
      fixedExpenses: { include: { pauses: true } },
      billEstimates: true,
      payments: true,
    },
  });

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      <PageHeader title="Cartões" action={<CardFormDialog />} />

      {cards.length === 0 ? (
        <EmptyState
          icon={CardIcon}
          text="Nenhum cartão cadastrado ainda."
          hint="Cadastre um para acompanhar a fatura."
        />
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {cards.map((card, index) => {
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
            // As assinaturas cobradas no cartão fazem parte da fatura: sem elas
            // esta tela mostrava um número menor que o do início.
            const cardFixedExpenses = card.fixedExpenses.map(toFixedExpenseInput);
            const expensePayments = card.payments.map((p) => ({
              cardId: p.cardId ?? undefined,
              dueDate: p.dueDate,
              amount: Number(p.amount),
              // Um parcial não quita a fatura.
              settled: p.settled,
            }));
            // A mesma janela de seis meses da tela do cartão, para as duas
            // telas responderem "qual é a próxima fatura" do mesmo jeito. Uma
            // janela curta faria a linha desaparecer de quem pagou as próximas
            // faturas adiantado, mesmo tendo parcela caindo depois.
            const nextBill = findNextOpenBill(
              buildCardBillSeries({
                card: {
                  id: card.id,
                  closingDay: card.closingDay,
                  dueDay: card.dueDay,
                },
                purchases,
                cardFixedExpenses,
                billEstimates,
                expensePayments,
                today,
                months: 6,
              }),
            );
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

            const overdue = nextBill && nextBill.dueDate.getTime() < todayStart.getTime();

            return (
              // Um bloco com cara de cartão de crédito, com o degradê do
              // próprio cartão. `h-full` iguala a altura dos vizinhos na grade.
              <Link
                key={card.id}
                href={`/cartoes/${card.id}`}
                className="group/card rise-in flex h-full flex-col gap-3.5 rounded-[22px] p-[18px] text-foreground shadow-[inset_0_0_0_1px_rgb(255_255_255/0.09),0_1px_2px_rgb(0_0_0/0.4)] transition-transform duration-150 ease-out-quint hover:-translate-y-0.5 active:scale-[0.98]"
                style={{ background: cardGradient(card.id), ...stagger(index, 80, 60) }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-heading text-xl leading-tight font-bold tracking-[-0.03em]">
                      {card.name}
                    </p>
                    <p className="text-[12.5px] text-foreground/70">
                      Fecha dia {card.closingDay} · vence dia {card.dueDay}
                    </p>
                  </div>
                  <ChevronRight
                    className="mt-1 size-5 shrink-0 text-foreground/60 transition-transform duration-150 group-hover/card:translate-x-0.5"
                    aria-hidden="true"
                  />
                </div>
                {nextBill ? (
                  <div className="flex flex-col gap-0.5">
                    <SectionLabel>{overdue ? "Fatura vencida" : "Próxima fatura"}</SectionLabel>
                    <p
                      className={`font-heading text-[26px] leading-tight font-bold tracking-[-0.035em] tabular-nums ${
                        overdue ? "text-negative" : ""
                      }`}
                    >
                      {/* Com parcial pago, o que importa é o que falta. */}
                      {formatCurrency(Math.max(0, nextBill.amount - (nextBill.partialPaid ?? 0)))}
                    </p>
                    {nextBill.partialPaid ? (
                      <p className="text-xs text-foreground/70 tabular-nums">
                        falta pagar · já pago {formatCurrency(nextBill.partialPaid)}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-[13px] text-foreground/70">Sem fatura em aberto.</p>
                )}
                {limitUsage && (
                  <div className="flex flex-col gap-1.5">
                    <span
                      aria-hidden="true"
                      className="h-1.5 overflow-hidden rounded-full bg-black/30"
                    >
                      <span
                        className={`grow-right block h-full rounded-full ${
                          limitUsage.percentUsed >= 90 ? "bg-negative" : "bg-primary"
                        }`}
                        style={
                          {
                            width: `${Math.min(100, Math.max(0, limitUsage.percentUsed))}%`,
                            "--grow-delay": `${250 + index * 60}ms`,
                          } as React.CSSProperties
                        }
                      />
                    </span>
                    <p className="text-xs text-foreground/70 tabular-nums">
                      {formatCurrency(limitUsage.available)} de {formatCurrency(limitUsage.limit)}{" "}
                      livres
                    </p>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
