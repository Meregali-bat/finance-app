"use client";

import { useState, useTransition } from "react";
import { CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/currency-input";
import { iconButton } from "@/components/ui/icon-button";
import { payNextChargeAhead } from "@/lib/actions/installment-advance";
import { unwrap } from "@/lib/action-result";
import { errorMessage } from "@/lib/error-message";
import { todayInputValue } from "@/lib/format";

/** "2026-12-10" → "10/12". */
const dayMonth = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Pagar adiantada a próxima cobrança de uma conta fixa, a que vence depois do
 * próximo pagamento. O dinheiro sai do ciclo de agora, e a cobrança do ciclo
 * seguinte fica quitada sem pesar de novo. A de dentro do ciclo se paga pelo
 * "Pagar" da Início, que já aceita antes do vencimento.
 */
export function PayAheadDialog({
  expenseId,
  label,
  dueDate,
  amount,
  minPaidOn,
}: {
  expenseId: string;
  label: string;
  /** "YYYY-MM-DD" da cobrança. */
  dueDate: string;
  amount: number;
  /** "YYYY-MM-DD": o começo do ciclo de agora, o dia mais antigo aceito. */
  minPaidOn: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const due = dayMonth(dueDate);

  function submit(formData: FormData) {
    setError(null);
    start(async () => {
      try {
        unwrap(
          await payNextChargeAhead(expenseId, {
            dueDate,
            amount: Number(formData.get("amount")),
            paidOn: String(formData.get("paidOn") ?? ""),
          }),
        );
        setOpen(false);
      } catch (e) {
        setError(errorMessage(e, "Não deu para salvar. Tente de novo."));
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setError(null);
      }}
    >
      <DialogTrigger
        render={
          <button
            type="button"
            className={iconButton({ tone: "ghost", size: "sm" })}
            aria-label={`Pagar adiantado: ${label}, vencimento de ${due}`}
            title={`Pagar adiantado o vencimento de ${due}`}
          />
        }
      >
        <CalendarCheck aria-hidden="true" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pagar adiantado</DialogTitle>
        </DialogHeader>
        <form action={submit} className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {label} · vencimento de {due}. O valor sai do ciclo de agora, e essa cobrança não pesa
            de novo no próximo.
          </p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ahead-amount">Valor pago</Label>
            <CurrencyInput id="ahead-amount" name="amount" defaultValue={amount} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ahead-date">Pago em</Label>
            <Input
              id="ahead-date"
              name="paidOn"
              type="date"
              defaultValue={todayInputValue()}
              min={minPaidOn}
              max={todayInputValue()}
              required
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando..." : "Confirmar pagamento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
