"use client";

import {
  ChevronRight,
  CreditCard as CardIcon,
  Receipt,
  CircleCheck,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteIconButton } from "@/components/delete-icon-button";
import { MovementFormDialog } from "@/components/forms/movement-form-dialog";
import { unmarkExpensePayment } from "@/lib/actions/expense-payment";
import { unmarkIncomeReceived } from "@/lib/actions/income-receipt";
import { formatCurrency, formatDate, formatDateOnly } from "@/lib/format";
import { toMovementValues, type HistoryItem, type MovementValues } from "@/lib/history-item";

type Options = {
  cards: { id: string; name: string }[];
  categories: { id: string; name: string }[];
};

/**
 * Uma linha de lançamento que abre o formulário de edição ao ser clicada.
 * A exclusão vive dentro do dialog: um botão dentro do gatilho seria HTML
 * inválido e deixaria o clique ambíguo.
 */
export function MovementRow({
  movement,
  cards,
  categories,
  subtitle,
  icon,
}: Options & {
  movement: MovementValues;
  subtitle?: string;
  icon?: React.ReactNode;
}) {
  return (
    <MovementFormDialog movement={movement} cards={cards} categories={categories}>
      <Card variant="interactive">
        <CardContent className="flex min-h-[3rem] items-center justify-between gap-3 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {icon}
            <div className="min-w-0">
              <p className="truncate font-medium">{movement.description}</p>
              {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`font-medium tabular-nums ${
                movement.type === "income" ? "text-primary" : ""
              }`}
            >
              {formatCurrency(movement.amount)}
            </span>
            <ChevronRight
              className="size-4 text-muted-foreground/60 transition-transform duration-150 group-hover/card:translate-x-0.5"
              aria-hidden="true"
            />
          </div>
        </CardContent>
      </Card>
    </MovementFormDialog>
  );
}

/**
 * Linha do Histórico. Lançamentos são editáveis; confirmações de pagamento não
 * — elas só podem ser desfeitas, o que devolve o lembrete à tela inicial.
 */
export function HistoryRow({ item, cards, categories }: Options & { item: HistoryItem }) {
  const isPayment = item.kind === "fixedExpensePayment" || item.kind === "cardBillPayment";
  const isReceipt = item.kind === "incomeReceipt";
  // Confirmação, como as de pagamento: não se edita um recebimento, só se
  // desfaz — e desfazer devolve o lembrete à tela inicial.
  const isConfirmation = isPayment || isReceipt;
  // paidAt é um instante de verdade, então segue o fuso local; a data de um
  // lançamento é um dia do calendário e é lida em UTC.
  const subtitle =
    (isPayment
      ? `Pago em ${formatDate(item.date)}`
      : isReceipt
        ? `Recebido em ${formatDate(item.date)}`
        : formatDateOnly(item.date)) +
    (item.kind === "card" && item.cardName ? ` · ${item.cardName}` : "");

  const icon = isConfirmation ? (
    <CircleCheck className="size-4 shrink-0 text-primary" aria-hidden="true" />
  ) : item.kind === "card" ? (
    <CardIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
  ) : (
    <Receipt className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
  );

  if (isConfirmation) {
    return (
      <Card>
        <CardContent className="flex items-center justify-between gap-3 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {icon}
            <div className="min-w-0">
              <p className="truncate font-medium">{item.description}</p>
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`font-medium tabular-nums ${isReceipt ? "text-primary" : ""}`}>
              {formatCurrency(Math.abs(item.amount))}
            </span>
            <DeleteIconButton
              action={
                isReceipt && item.incomeId
                  ? unmarkIncomeReceived.bind(null, item.incomeId, item.date)
                  : unmarkExpensePayment.bind(null, item.id)
              }
              confirmMessage={
                isReceipt
                  ? `Desfazer o recebimento de "${item.description}"? O lembrete volta a aparecer no início.`
                  : `Desfazer o pagamento de "${item.description}"? O lembrete volta a aparecer no início.`
              }
            />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <MovementRow
      cards={cards}
      categories={categories}
      subtitle={subtitle}
      icon={icon}
      movement={toMovementValues(item)}
    />
  );
}
