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
import {
  formatCurrency,
  formatDateTime,
  formatInstant,
  formatShortDate,
} from "@/lib/format";
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
  displayAmount,
}: Options & {
  movement: MovementValues;
  subtitle?: string;
  icon?: React.ReactNode;
  /**
   * O valor da linha, quando ele difere do que o formulário edita: uma parcela
   * mostra o valor dela, mas abre a compra inteira para edição.
   */
  displayAmount?: number;
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
              {formatCurrency(displayAmount ?? movement.amount)}
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
  // Derivada da fatura paga, não uma linha de tabela: não há o que editar nem
  // o que desfazer aqui. Quem mexe nela é a aba Despesas dos Fixos.
  const isCardFixedExpense = item.kind === "cardFixedExpense";
  // Também derivadas, e também só de leitura: a previsão se edita na tela do
  // cartão, a diferença sai do pagamento, e a caixinha tem a própria tela.
  const isDerived =
    isCardFixedExpense ||
    item.kind === "cardEstimate" ||
    item.kind === "cardBillAdjustment" ||
    item.kind === "jarDeposit";
  // Confirmação, como as de pagamento: não se edita um recebimento, só se
  // desfaz — e desfazer devolve o lembrete à tela inicial.
  const isConfirmation = isPayment || isReceipt;
  // Cada um mostra a hora que de fato tem. `paidAt` é um instante, então o
  // pagamento leva hora; `occurrenceDate` é o dia do pagamento da receita, e
  // um "00:00" ali seria ruído; o lançamento pega a hora do cadastro.
  const subtitle = isPayment
    ? // Com "Pago em" informado, o pagamento guarda só o dia, à meia-noite; a
      // hora só diz algo quando ele foi marcado como pago hoje.
      `Pago em ${
        item.date.getHours() === 0 && item.date.getMinutes() === 0
          ? formatShortDate(item.date)
          : formatInstant(item.date)
      }`
    : isReceipt
      ? `Recebido em ${formatShortDate(item.date)}`
      : isCardFixedExpense || item.kind === "cardEstimate"
        ? `Na fatura do ${item.cardName ?? "cartão"} · ${formatShortDate(item.date)}`
        : item.kind === "cardBillAdjustment"
          ? `${item.amount > 0 ? "Pago a mais" : "Pago a menos"} que o previsto · fatura de ${formatShortDate(item.date)}`
          : item.kind === "jarDeposit"
            ? `Caixinha · ${formatInstant(item.date)}`
            : item.kind === "card"
              ? // A parcela aparece no mês da fatura que a cobra; a compra
                // inteira e o dia dela vêm junto, para ela ser reconhecível.
                [
                  `Fatura de ${formatShortDate(item.date)}`,
                  item.cardName,
                  item.installments && item.installments > 1
                    ? `${item.installmentNumber}/${item.installments} de ${formatCurrency(item.purchaseAmount ?? 0)}`
                    : null,
                  item.purchaseDate ? `comprado em ${formatShortDate(item.purchaseDate, "UTC")}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : formatDateTime(item.date, item.createdAt);

  const icon = isConfirmation ? (
    <CircleCheck className="size-4 shrink-0 text-primary" aria-hidden="true" />
  ) : item.kind === "card" ||
    isCardFixedExpense ||
    item.kind === "cardEstimate" ||
    item.kind === "cardBillAdjustment" ? (
    <CardIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
  ) : (
    <Receipt className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
  );

  if (isDerived) {
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
          <span className="shrink-0 font-medium tabular-nums">
            {formatCurrency(item.amount)}
          </span>
        </CardContent>
      </Card>
    );
  }

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
      displayAmount={Math.abs(item.amount)}
    />
  );
}
