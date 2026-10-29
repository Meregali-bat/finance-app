import Link from "next/link";
import { headers } from "next/headers";
import { ChevronRight, CreditCard as CardIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { formatCurrency } from "@/lib/format";

/** "25/11": o vencimento e o fechamento da fatura, curtos. */
const dayMonth = (date: Date) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date);
import { toFixedExpenseInput } from "@/lib/budget-inputs";
import { buildCardBillSeries, findNextOpenBill, getCardLimitUsage } from "@/lib/period";
import { stagger } from "@/components/list-row";
import { cardSurface } from "@/lib/card-look";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/page-header";
import { CardFormDialog } from "@/components/forms/card-form-dialog";
import { ShortcutSetup } from "@/components/shortcut-setup";
import { WalletCardQuestion } from "@/components/wallet-card-question";
import { shortcutLanguage } from "@/lib/shortcut-language";

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

  const [user, requestHeaders, unansweredWalletCards, strandedPurchases] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { shortcutTokenHash: true } }),
    headers(),
    // Nomes de cartão que a Carteira mandou e ninguém respondeu ainda.
    prisma.walletCardAlias.findMany({
      where: { userId, cardId: null, asAccount: false },
      orderBy: { createdAt: "asc" },
      select: { id: true, walletName: true },
    }),
    prisma.transaction.findMany({
      where: { userId, walletCardName: { not: null } },
      select: { walletCardName: true, amount: true },
    }),
  ]);
  const pendingWalletCards = unansweredWalletCards.map((alias) => {
    const purchases = strandedPurchases.filter((t) => t.walletCardName === alias.walletName);
    return {
      ...alias,
      count: purchases.length,
      total: purchases.reduce((sum, t) => sum + Number(t.amount), 0),
    };
  });
  // O endereço que o atalho chama, no domínio de onde a tela foi aberta.
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const shortcutEndpoint = `${protocol}://${host}/api/atalho`;

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      <PageHeader title="Cartões" action={<CardFormDialog />} />

      {cards.length > 0 &&
        pendingWalletCards.map((pending) => (
          <WalletCardQuestion
            key={pending.id}
            pending={pending}
            cards={cards.map((c) => ({ id: c.id, name: c.name }))}
          />
        ))}

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
            // Aberta: o ciclo ainda não fechou, e a fatura ainda pode crescer.
            const billOpen = nextBill && today.getTime() <= nextBill.cycleEnd.getTime();

            return (
              // Um bloco com cara de cartão de crédito, com o degradê do
              // próprio cartão. `h-full` iguala a altura dos vizinhos na grade.
              <Link
                key={card.id}
                href={`/cartoes/${card.id}`}
                className="group/card rise-in flex h-full flex-col gap-3.5 rounded-[22px] p-[18px] text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.09),0_1px_2px_rgb(0_0_0/0.4)] transition-transform duration-150 ease-out-quint hover:-translate-y-0.5 active:scale-[0.98]"
                style={{ background: cardSurface(card.id, card.style), ...stagger(index, 80, 60) }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-heading text-xl leading-tight font-bold tracking-[-0.03em]">
                      {card.name}
                    </p>
                    {/* Com fatura, as datas dela vão junto do valor; sem, a regra. */}
                    {!nextBill && (
                      <p className="text-[12.5px] text-white/85">
                        Fecha dia {card.closingDay} · vence dia {card.dueDay}
                      </p>
                    )}
                  </div>
                  <ChevronRight
                    className="mt-1 size-5 shrink-0 text-white/75 transition-transform duration-150 group-hover/card:translate-x-0.5"
                    aria-hidden="true"
                  />
                </div>
                {nextBill ? (
                  <div className="flex flex-col gap-0.5">
                    {/* Cores fixas, e não os tokens do tema: o fundo é a cor do cartão,
                        escura nos dois temas. */}
                    <span className="text-[12.5px] font-medium text-white/85">
                      {overdue ? "Fatura vencida" : "Próxima fatura"}
                    </span>
                    <p
                      className={`font-heading text-[26px] leading-tight font-bold tracking-[-0.035em] tabular-nums ${
                        overdue ? "text-[#ffb0a6]" : ""
                      }`}
                    >
                      {/* Com parcial pago, o que importa é o que falta. */}
                      {formatCurrency(Math.max(0, nextBill.amount - (nextBill.partialPaid ?? 0)))}
                    </p>
                    {nextBill.partialPaid ? (
                      <p className="text-xs text-white/85 tabular-nums">
                        falta pagar · já pago {formatCurrency(nextBill.partialPaid)}
                      </p>
                    ) : null}
                    {/* Quando vence e se ainda cresce: "aberta" é a fatura
                        que ainda recebe compras. */}
                    <p className="text-xs text-white/85 tabular-nums">
                      {overdue
                        ? `venceu ${dayMonth(nextBill.dueDate)}`
                        : billOpen
                          ? `vence ${dayMonth(nextBill.dueDate)} · aberta, fecha ${dayMonth(nextBill.cycleEnd)}`
                          : `vence ${dayMonth(nextBill.dueDate)} · fechada`}
                    </p>
                  </div>
                ) : (
                  <p className="text-[13px] text-white/85">Sem fatura em aberto.</p>
                )}
                {limitUsage && (
                  <div className="flex flex-col gap-1.5">
                    <span
                      aria-hidden="true"
                      className="h-1.5 overflow-hidden rounded-full bg-black/30"
                    >
                      <span
                        className={`grow-right block h-full rounded-full ${
                          limitUsage.percentUsed >= 90 ? "bg-[#ff7a6b]" : "bg-white/90"
                        }`}
                        style={
                          {
                            width: `${Math.min(100, Math.max(0, limitUsage.percentUsed))}%`,
                            "--grow-delay": `${250 + index * 60}ms`,
                          } as React.CSSProperties
                        }
                      />
                    </span>
                    {/* A barra enche com o usado, e o texto fala dele também. */}
                    <p className="text-xs text-white/85 tabular-nums">
                      {formatCurrency(limitUsage.used)} de {formatCurrency(limitUsage.limit)}{" "}
                      usados · {formatCurrency(limitUsage.available)} livres
                    </p>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}

      <div className="rise-in" style={stagger(cards.length, 160)}>
        <ShortcutSetup
          active={Boolean(user?.shortcutTokenHash)}
          endpoint={shortcutEndpoint}
          deviceLanguage={shortcutLanguage(requestHeaders.get("accept-language"))}
        />
      </div>
    </div>
  );
}
