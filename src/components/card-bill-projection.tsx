import { homeCard } from "@/components/home-card";
import { ListRow, stagger } from "@/components/list-row";
import { SectionLabel } from "@/components/page-header";
import { DeleteIconButton } from "@/components/delete-icon-button";
import { formatCurrency, formatDate } from "@/lib/format";
import { deleteCardBillEstimate } from "@/lib/actions/card-bill-estimate";
import { LineChart } from "@/components/charts/line-chart";

/**
 * Uma fatura projetada, já reduzida a valores que atravessam para o cliente —
 * `Decimal` e `Date` do Prisma não passam, por isso a página converte antes.
 */
export type ProjectedBill = {
  /** ISO, só para a key da lista. */
  dueDateIso: string;
  dueDate: Date;
  amount: number;
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

export function CardBillProjection({
  cardId,
  bills,
  estimates,
}: {
  cardId: string;
  bills: ProjectedBill[];
  estimates: ListedEstimate[];
}) {
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
          <SectionLabel>Próximas faturas</SectionLabel>
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
                  bill.estimateAmount > 0
                    ? `inclui ${formatCurrency(bill.estimateAmount)} previstos`
                    : null,
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
            />
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
          {estimates.map((estimate) => (
            <ListRow
              key={estimate.id}
              title={estimate.description}
              subtitle={`Na fatura de ${formatDate(estimate.dueDate)}`}
              value={formatCurrency(estimate.amount)}
              trailing={
                <DeleteIconButton
                  action={deleteCardBillEstimate.bind(null, estimate.id, cardId)}
                  confirmMessage={`Excluir a previsão "${estimate.description}"? A fatura volta a mostrar só o que as compras somam.`}
                />
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
