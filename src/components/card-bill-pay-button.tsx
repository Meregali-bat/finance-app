"use client";

import { useRef, useState, useTransition } from "react";
import { ConfirmPaymentDialog } from "@/components/confirm-payment-dialog";
import { UndoToast, type UndoToastState } from "@/components/undo-toast";
import { unmarkExpensePayment } from "@/lib/actions/expense-payment";

/**
 * Pagar a fatura da tela do cartão, com o mesmo "Desfazer" da Início: toda
 * ação de dinheiro volta atrás no mesmo lugar em que foi feita.
 *
 * Fica montado mesmo sem fatura a pagar (`bill` nulo): pagar a última tira a
 * fatura da vez, e o toast com o "Desfazer" não pode sumir junto.
 */
export function CardBillPayButton({
  action,
  bill,
}: {
  action: (formData: FormData) => Promise<{ paymentId: string }>;
  bill: { label: string; dueDate: Date; amount: number; paidSoFar: number } | null;
}) {
  const [toast, setToast] = useState<(UndoToastState & { paymentId: string }) | null>(null);
  const [undoing, startUndo] = useTransition();
  const seq = useRef(0);

  return (
    <>
      {bill && (
        <ConfirmPaymentDialog
          action={action}
          label={bill.label}
          dueDate={bill.dueDate}
          amount={bill.amount}
          allowPartial
          paidSoFar={bill.paidSoFar}
          onDone={({ paymentId, settled }) =>
            setToast({
              id: ++seq.current,
              paymentId,
              hasUndo: true,
              text: settled ? "Fatura marcada como paga" : "Pagamento parcial registrado",
            })
          }
        />
      )}
      <UndoToast
        toast={toast}
        undoing={undoing}
        onDismiss={() => setToast(null)}
        onUndo={() => {
          if (!toast) return;
          const { paymentId } = toast;
          setToast(null);
          startUndo(() => unmarkExpensePayment(paymentId));
        }}
      />
    </>
  );
}
