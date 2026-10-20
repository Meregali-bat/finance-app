"use client";

import {
  ChevronRight,
  CreditCard as CardIcon,
  Receipt,
  CircleCheck,
  PiggyBank,
} from "lucide-react";
import {
  IconSquare,
  ListRow,
  listRowSurface,
  SubtitleParts,
  type IconTone,
} from "@/components/list-row";
import { DeleteIconButton } from "@/components/delete-icon-button";
import { MovementFormDialog } from "@/components/forms/movement-form-dialog";
import { unmarkExpensePayment } from "@/lib/actions/expense-payment";
import { unmarkIncomeReceived } from "@/lib/actions/income-receipt";
import { formatCurrency, formatDateTime, formatInstant, formatShortDate } from "@/lib/format";
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
  icon = <Receipt />,
  tone = "neutral",
  displayAmount,
}: Options & {
  movement: MovementValues;
  subtitle?: string;
  /** O ícone lucide, sem tamanho: o quadrado de ícone ajusta. */
  icon?: React.ReactNode;
  tone?: IconTone;
  /**
   * O valor da linha, quando ele difere do que o formulário edita: uma parcela
   * mostra o valor dela, mas abre a compra inteira para edição.
   */
  displayAmount?: number;
}) {
  return (
    <MovementFormDialog movement={movement} cards={cards} categories={categories}>
      <div
        className={listRowSurface(
          "group/row flex cursor-pointer items-center gap-3 transition-[transform,background-color,box-shadow] duration-150 ease-out-quint hover:-translate-y-0.5 hover:bg-card-hover hover:shadow-(--shadow-card-hover) active:scale-[0.99]",
        )}
      >
        <IconSquare tone={tone}>{icon}</IconSquare>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-semibold">{movement.description}</p>
          {subtitle && (
            <p className="text-[12.5px] text-muted-foreground">
              <SubtitleParts text={subtitle} />
            </p>
          )}
        </div>
        <span
          className={`shrink-0 text-[14.5px] font-semibold tabular-nums ${
            movement.type === "income" ? "text-positive" : ""
          }`}
        >
          {formatCurrency(displayAmount ?? movement.amount)}
        </span>
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground/60 transition-transform duration-150 group-hover/row:translate-x-0.5"
          aria-hidden="true"
        />
      </div>
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
                  item.purchaseDate
                    ? `comprado em ${formatShortDate(item.purchaseDate, "UTC")}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : formatDateTime(item.date, item.createdAt);
  const fullSubtitle = item.lentTo ? `${subtitle} · emprestado a ${item.lentTo}` : subtitle;

  const icon = isConfirmation ? (
    <CircleCheck />
  ) : item.kind === "jarDeposit" ? (
    <PiggyBank />
  ) : item.kind === "card" ||
    isCardFixedExpense ||
    item.kind === "cardEstimate" ||
    item.kind === "cardBillAdjustment" ? (
    <CardIcon />
  ) : (
    <Receipt />
  );
  // Recebimento em turquesa, como o valor dele; pagamento no tom da marca.
  const tone: IconTone = isReceipt ? "positive" : isConfirmation ? "accent" : "neutral";

  if (isDerived) {
    return (
      <ListRow
        icon={icon}
        tone={tone}
        title={item.description}
        subtitle={subtitle}
        value={formatCurrency(item.amount)}
      />
    );
  }

  if (isConfirmation) {
    return (
      <ListRow
        icon={icon}
        tone={tone}
        title={item.description}
        subtitle={subtitle}
        value={formatCurrency(Math.abs(item.amount))}
        valueClassName={isReceipt ? "text-positive" : undefined}
        trailing={
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
        }
      />
    );
  }

  return (
    <MovementRow
      cards={cards}
      categories={categories}
      subtitle={fullSubtitle}
      icon={icon}
      tone={tone}
      movement={toMovementValues(item)}
      displayAmount={Math.abs(item.amount)}
    />
  );
}
