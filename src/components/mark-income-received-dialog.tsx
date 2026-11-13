"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/currency-input";
import { markIncomeReceived } from "@/lib/actions/income-receipt";
import type { IconTrigger } from "@/components/ui/icon-button";
import { errorMessage } from "@/lib/error-message";
import { todayInputValue } from "@/lib/format";

export function MarkIncomeReceivedDialog({
  incomeId,
  label,
  dueDate,
  amount,
  early = false,
  earliestOn,
  trigger,
  onDone,
}: {
  incomeId: string;
  label: string;
  dueDate: Date;
  amount: number;
  /**
   * O pagamento ainda não chegou ao dia cadastrado: o dinheiro caiu antes, e o
   * diálogo pergunta em que dia, que é onde o ciclo novo começa.
   */
  early?: boolean;
  /** Com `early`: "YYYY-MM-DD", o dia mais antigo aceito. */
  earliestOn?: string;
  trigger?: IconTrigger;
  /** Depois de salvar, com o que o "Desfazer" da Início precisa. */
  onDone?: (result: { incomeId: string; occurrenceDate: Date }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await markIncomeReceived(incomeId, formData);
        setOpen(false);
        onDone?.(result);
      } catch (e) {
        setError(errorMessage(e, "Erro ao salvar"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger
          render={
            <button
              type="button"
              className={trigger.className}
              aria-label={trigger.label}
              title={trigger.label}
            />
          }
        >
          {trigger.icon}
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button size="sm" variant="secondary" />}>
          Marcar como recebida
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar recebimento</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{label}</p>
          {/*
            The exact instant, not a "YYYY-MM-DD" string: formatting the date
            here would render it in the browser's timezone, which can land a
            day off from the payday the server computed.
          */}
          <input type="hidden" name="occurrenceDate" value={dueDate.toISOString()} />
          {early && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="receipt-on">Caiu em</Label>
              <Input
                id="receipt-on"
                name="receivedOn"
                type="date"
                defaultValue={todayInputValue()}
                min={earliestOn}
                max={todayInputValue()}
                required
              />
              <p className="text-[13px] text-muted-foreground">
                O ciclo novo começa nesse dia, e as contas dele já aparecem para pagar.
              </p>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="receipt-amount">Valor recebido</Label>
            <CurrencyInput id="receipt-amount" name="amount" defaultValue={amount} required />
          </div>
          {error && (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
