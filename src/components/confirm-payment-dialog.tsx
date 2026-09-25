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
import { Input } from "@/components/ui/input";
import { todayInputValue } from "@/lib/format";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ACCOUNT = "__account__";

export function ConfirmPaymentDialog({
  action,
  label,
  dueDate,
  amount,
  cards,
}: {
  /** A server action já ligada ao id da despesa ou do cartão pelo `.bind`. */
  action: (formData: FormData) => Promise<void>;
  label: string;
  dueDate: Date;
  amount: number;
  /** Só para despesa fixa: permite dizer que aquele mês foi pago no cartão. */
  cards?: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [cardId, setCardId] = useState(ACCOUNT);
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
          {/*
            O dia em que o dinheiro saiu. Com a data do clique, uma conta paga
            antes da última correção de saldo sairia dele de novo.
          */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="payment-date">Pago em</Label>
            <Input
              id="payment-date"
              name="paidOn"
              type="date"
              defaultValue={todayInputValue()}
              max={todayInputValue()}
              required
            />
          </div>
          {cards && cards.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="payment-card">Como foi pago</Label>
              <input type="hidden" name="cardId" value={cardId === ACCOUNT ? "" : cardId} />
              <Select value={cardId} onValueChange={(v) => setCardId(v as string)}>
                <SelectTrigger id="payment-card" className="w-full">
                  <SelectValue>
                    {(value: string) =>
                      value === ACCOUNT ? "Conta corrente" : cards.find((c) => c.id === value)?.name
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ACCOUNT}>Conta corrente</SelectItem>
                  {cards.map((card) => (
                    <SelectItem key={card.id} value={card.id}>
                      {card.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
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
