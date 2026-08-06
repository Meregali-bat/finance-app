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
import { CurrencyInput } from "@/components/currency-input";
import { dateInputValue } from "@/lib/format";
import { markIncomeReceived } from "@/lib/actions/income-receipt";

export function MarkIncomeReceivedDialog({
  incomeId,
  label,
  dueDate,
  amount,
}: {
  incomeId: string;
  label: string;
  dueDate: Date;
  amount: number;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await markIncomeReceived(incomeId, formData);
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="secondary" />}>
        Marcar como recebida
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar recebimento</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{label}</p>
          <input type="hidden" name="occurrenceDate" value={dateInputValue(dueDate)} />
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
