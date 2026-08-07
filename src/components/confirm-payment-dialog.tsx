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

export function ConfirmPaymentDialog({
  action,
  label,
  dueDate,
  amount,
}: {
  /** A server action já ligada ao id da despesa ou do cartão pelo `.bind`. */
  action: (formData: FormData) => Promise<void>;
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
        await action(formData);
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="secondary" />}>
        Marcar como paga
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar pagamento</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{label}</p>
          {/*
            O instante exato, não uma string "YYYY-MM-DD": formatar a data
            aqui a renderizaria no fuso do browser, o que pode cair um dia
            fora do vencimento que o servidor calculou.
          */}
          <input type="hidden" name="dueDate" value={dueDate.toISOString()} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="payment-amount">Valor pago</Label>
            <CurrencyInput id="payment-amount" name="amount" defaultValue={amount} required />
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
