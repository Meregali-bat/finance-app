import Link from "next/link";
import { ChevronRight, CreditCard as CardIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { formatCurrency } from "@/lib/format";
import { toFixedExpenseInput } from "@/lib/budget-inputs";
import { buildCardBillSeries, findNextOpenBill, getCardLimitUsage } from "@/lib/period";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
                          {nextBill.dueDate.getTime() < todayStart.getTime()
                            ? "Fatura vencida"
                            : "Próxima fatura"}
                          : {formatCurrency(nextBill.amount)}
                        </p>
                      )}
                      {limitUsage && (
                        <>
                          {/* Progress renderiza os children acima da trilha, por
                              isso o texto vem depois. Ele não adiciona nada
                              focável, então o Link que envolve o cartão continua
                              clicável. */}
                          <Progress
                            value={limitUsage.percentUsed}
                            className="mt-2 gap-1.5"
                            indicatorClassName={
                              limitUsage.percentUsed >= 90 ? "bg-negative" : undefined
                            }
                          />
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {formatCurrency(limitUsage.available)} de{" "}
                            {formatCurrency(limitUsage.limit)} livres
                          </p>
                        </>
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
