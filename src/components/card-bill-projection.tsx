import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionLabel } from "@/components/page-header";
import { DeleteIconButton } from "@/components/delete-icon-button";
import { formatCurrency, formatDate } from "@/lib/format";
import { deleteCardBillEstimate } from "@/lib/actions/card-bill-estimate";

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
      <div className="flex flex-col gap-2">
        <SectionLabel>Faturas</SectionLabel>
        {bills.map((bill) => (
          <Card key={bill.dueDateIso}>
            <CardContent className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {bill.overdue ? "Venceu" : "Vence"} {formatDate(bill.dueDate)}
                </p>
                {bill.estimateAmount > 0 && (
                  <p className="text-xs text-muted-foreground tabular-nums">
                    inclui {formatCurrency(bill.estimateAmount)} previstos
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {bill.paid ? (
                  <Badge variant="secondary">Paga</Badge>
                ) : (
                  bill.overdue && <Badge variant="destructive">Vencida</Badge>
                )}
                <span
                  className={`font-medium tabular-nums ${
                    // Uma fatura zerada não é uma dívida: não merece o destaque
                    // de um valor a pagar.
                    bill.amount === 0 ? "text-muted-foreground" : ""
                  }`}
                >
                  {formatCurrency(bill.paid ? (bill.paidAmount ?? bill.amount) : bill.amount)}
                </span>
              </div>
            </CardContent>
          </Card>
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
            <Card key={estimate.id}>
              <CardContent className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{estimate.description}</p>
                  <p className="text-sm text-muted-foreground">
                    Na fatura de {formatDate(estimate.dueDate)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-medium tabular-nums">
                    {formatCurrency(estimate.amount)}
                  </span>
                  <DeleteIconButton
                    action={deleteCardBillEstimate.bind(null, estimate.id, cardId)}
                    confirmMessage={`Excluir a previsão "${estimate.description}"? A fatura volta a mostrar só o que as compras somam.`}
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
