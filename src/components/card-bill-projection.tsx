import { ChevronDown } from "lucide-react";
import { homeCard } from "@/components/home-card";
import { ListRow, stagger } from "@/components/list-row";
import { SectionLabel } from "@/components/page-header";
import { DeleteIconButton } from "@/components/delete-icon-button";
import { formatCurrency, formatDate } from "@/lib/format";
import { deleteCardBillEstimate } from "@/lib/actions/card-bill-estimate";
import { LineChart } from "@/components/charts/line-chart";
import { ConfirmPaymentDialog } from "@/components/confirm-payment-dialog";

/**
 * Uma fatura projetada, já reduzida a valores que atravessam para o cliente —
 * `Decimal` e `Date` do Prisma não passam, por isso a página converte antes.
 */
export type ProjectedBill = {
  /** ISO, só para a key da lista. */
  dueDateIso: string;
  dueDate: Date;
  /** O fechamento do ciclo que gera a fatura. */
  cycleEnd: Date;
  /** Ainda recebe compras: o ciclo não fechou. */
  open: boolean;
  /** O que a fatura cobra, linha a linha: parcelas, assinaturas, previsões. */
  items: { label: string; detail: string; amount: number }[];
  amount: number;
  /** As três partes do total, para a linha dizer de onde ele vem. */
  purchaseAmount: number;
  fixedExpenseAmount: number;
  estimateAmount: number;
  paid: boolean;
  paidAmount?: number;
  /** Em aberto, com pagamentos parciais: quanto eles já pagaram. */
  partialPaid?: number;
  /** Já venceu e ainda não foi paga — resolvido no servidor, junto do resto. */
  overdue: boolean;
};

export type ListedEstimate = {
  id: string;
  description: string;
  dueDate: Date;
  amount: number;
};

/** "compras R$ 1.750,59 · assinaturas R$ 209,00 · previsto R$ 100,00". */
function billParts(bill: ProjectedBill): string | null {
  const parts = [
    ["compras", bill.purchaseAmount],
    ["assinaturas", bill.fixedExpenseAmount],
    ["previsto", bill.estimateAmount],
  ].filter(([, amount]) => (amount as number) >= 0.005) as [string, number][];
  if (parts.length < 2) return null;
  return parts.map(([label, amount]) => `${label} ${formatCurrency(amount)}`).join(" · ");
}

/**
 * Onde a previsão cai e, quando as compras da fatura já chegam ao valor dela,
 * o aviso: a previsão soma às compras e nunca sai sozinha, então a que era
 * delas passa a contar em dobro.
 */
function estimateSubtitle(estimate: ListedEstimate, bill: ProjectedBill | undefined) {
  const where = `Na fatura de ${formatDate(estimate.dueDate)}`;
  if (!bill || bill.paid) return where;
  const real = bill.purchaseAmount + bill.fixedExpenseAmount;
  if (real + 0.005 < estimate.amount) return where;
  return `${where} · as compras dela já somam ${formatCurrency(real)}: se a previsão era delas, exclua para não contar em dobro`;
}

export function CardBillProjection({
  cardId,
  cardName,
  bills,
  estimates,
  payAction,
}: {
  cardId: string;
  cardName: string;
  bills: ProjectedBill[];
  estimates: ListedEstimate[];
  /** `markCardBillPaid` já ligada ao cartão: pagar daqui, e não só da Início. */
  payAction: (formData: FormData) => Promise<{ paymentId: string }>;
}) {
  const nextOpen = bills.find((b) => !b.paid && b.amount > 0);
  const billOf = (e: ListedEstimate) =>
    bills.find((b) => b.dueDate.getTime() === new Date(e.dueDate).setHours(0, 0, 0, 0));
  const paidDue = new Set(bills.filter((b) => b.paid).map((b) => b.dueDate.getTime()));
  const firstDue = bills[0]?.dueDate.getTime() ?? 0;
  const isPast = (e: ListedEstimate) =>
    paidDue.has(e.dueDate.getTime()) || e.dueDate.getTime() < firstDue;
  const upcoming = estimates.filter((e) => !isPast(e));
  const past = estimates.filter(isPast);
  const estimateRow = (estimate: ListedEstimate) => (
    <ListRow
      key={estimate.id}
      title={estimate.description}
      subtitle={estimateSubtitle(estimate, billOf(estimate))}
      value={formatCurrency(estimate.amount)}
      trailing={
        <DeleteIconButton
          action={deleteCardBillEstimate.bind(null, estimate.id, cardId)}
          confirmMessage={`Excluir a previsão "${estimate.description}"? A fatura volta a mostrar só o que as compras somam.`}
        />
      }
    />
  );
  return (
    <div className="flex flex-col gap-6">
      {/* As próximas faturas lado a lado, em rosé; a já paga fica de fundo.
          "Vencida" não depende da cor — está no tooltip, na tabela e no selo
          da lista logo abaixo. */}
      {bills.length > 1 && (
        <div
          className={homeCard("rise-in flex flex-col gap-4")}
          style={{ "--rise-delay": "180ms" } as React.CSSProperties}
        >
          <SectionLabel>Faturas por vencimento</SectionLabel>
          <LineChart
            title="Valor das faturas por vencimento"
            height={150}
            points={bills.map((bill) => {
              const value = bill.paid ? (bill.paidAmount ?? bill.amount) : bill.amount;
              return {
                key: bill.dueDateIso,
                label: new Intl.DateTimeFormat("pt-BR", { month: "short" })
                  .format(bill.dueDate)
                  .replace(".", ""),
                value,
                valueLabel: formatCurrency(value),
                muted: bill.paid,
                detail: `${bill.overdue ? "Venceu" : "Vence"} ${formatDate(bill.dueDate)}${
                  bill.paid ? " · paga" : bill.overdue ? " · vencida" : ""
                }`,
                selected: bill === bills.find((b) => !b.paid && b.amount > 0),
              };
            })}
          />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <SectionLabel>Faturas</SectionLabel>
        {bills.map((bill, index) => (
          <div key={bill.dueDateIso} className="rise-in" style={stagger(index, 220)}>
            <ListRow
              title={`${bill.overdue ? "Venceu" : "Vence"} ${formatDate(bill.dueDate)}`}
              subtitle={
                [
                  bill.partialPaid
                    ? `pago ${formatCurrency(bill.partialPaid)} · falta ${formatCurrency(Math.max(0, bill.amount - bill.partialPaid))}`
                    : null,
                  // A composição, quando há mais de uma parte: só "inclui
                  // R$ 100 previstos" escondia as assinaturas, e a soma das
                  // compras não chegava no total.
                  billParts(bill),
                ]
                  .filter(Boolean)
                  .join(" · ") || undefined
              }
              value={
                <span className="flex items-center gap-2">
                  {bill.paid ? (
                    <span className="flex h-[22px] items-center rounded-full bg-secondary px-2.5 text-[11px] font-semibold">
                      Paga
                    </span>
                  ) : (
                    bill.overdue && (
                      <span className="flex h-[22px] items-center rounded-full bg-negative/15 px-2.5 text-[11px] font-semibold text-negative">
                        Vencida
                      </span>
                    )
                  )}
                  {formatCurrency(bill.paid ? (bill.paidAmount ?? bill.amount) : bill.amount)}
                </span>
              }
              valueClassName={bill.amount === 0 ? "text-muted-foreground" : undefined}
              // Fatura futura ainda vazia: contexto, não algo a pagar.
              dim={bill.amount === 0 && !bill.paid}
            >
              {(bill.items.length > 0 || bill === nextOpen) && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {bill.items.length > 0 && (
                    <details className="group/bill min-w-0 basis-full">
                      <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1 rounded-sm text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                        O que tem nesta fatura ({bill.items.length})
                        <ChevronDown
                          aria-hidden="true"
                          className="size-3.5 transition-transform duration-150 group-open/bill:rotate-180"
                        />
                      </summary>
                      <ul className="flex flex-col gap-1.5 border-t border-(--hairline) pt-2 text-[13px]">
                        {bill.items.map((item, i) => (
                          <li key={i} className="flex items-baseline justify-between gap-3">
                            <span className="min-w-0">
                              <span className="block truncate">{item.label}</span>
                              <span className="block text-xs text-muted-foreground tabular-nums">
                                {item.detail}
                              </span>
                            </span>
                            <span className="shrink-0 tabular-nums">
                              {formatCurrency(item.amount)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {bill === nextOpen && (
                    <ConfirmPaymentDialog
                      action={payAction}
                      label={`Fatura do ${cardName} que vence ${formatDate(bill.dueDate)}`}
                      dueDate={bill.dueDate}
                      amount={Math.max(0, bill.amount - (bill.partialPaid ?? 0))}
                      allowPartial
                      paidSoFar={bill.partialPaid ?? 0}
                    />
                  )}
                </div>
              )}
            </ListRow>
          </div>
        ))}
      </div>

      {/* As previsões ficam numa lista própria em vez de escondidas dentro das
          faturas justamente porque somam ao calculado: é o único jeito de o
          usuário ver o que previu e poder tirar quando a compra real chegar.
          Nada as remove automaticamente. */}
      {estimates.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel>Previsões lançadas</SectionLabel>
          {/* As de faturas já pagas não mudam mais nada: ficam recolhidas, e
              a lista à vista é só a que ainda pesa numa fatura em aberto. */}
          {upcoming.map(estimateRow)}
          {upcoming.length === 0 && (
            <p className="text-[13px] text-muted-foreground">
              Nenhuma previsão numa fatura em aberto.
            </p>
          )}
          {past.length > 0 && (
            <details className="group/past">
              <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1 rounded-sm text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                Anteriores, de faturas pagas ({past.length})
                <ChevronDown
                  aria-hidden="true"
                  className="size-3.5 transition-transform duration-150 group-open/past:rotate-180"
                />
              </summary>
              <div className="flex flex-col gap-2">{past.map(estimateRow)}</div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
