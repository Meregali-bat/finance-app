"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { CurrencyInput } from "@/components/currency-input";
import { createTransaction } from "@/lib/actions/transaction";
import { createCardPurchase } from "@/lib/actions/card";
import { todayInputValue } from "@/lib/format";

const CASH = "__cash__";

export function MovementFormDialog({ cards }: { cards: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [cardId, setCardId] = useState<string>(CASH);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        if (cardId !== CASH) {
          await createCardPurchase(cardId, formData);
        } else {
          await createTransaction(formData);
        }
        setOpen(false);
        setCardId(CASH);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button size="lg" className="h-14 w-14 rounded-full p-0 shadow-lg shadow-primary/20" />}
      >
        <Plus className="size-6" />
        <span className="sr-only">Nova movimentação</span>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova movimentação</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Descrição</Label>
            <Input id="description" name="description" placeholder="Almoço" required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="amount">Valor</Label>
              <CurrencyInput id="amount" name="amount" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="date">Data</Label>
              <Input id="date" name="date" type="date" defaultValue={todayInputValue()} required />
            </div>
          </div>
          {cards.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="cardId">Como foi pago</Label>
              <Select value={cardId} onValueChange={(v) => setCardId(v as string)}>
                <SelectTrigger id="cardId" className="w-full">
                  <SelectValue>
                    {(value: string) =>
                      value === CASH ? "À vista" : cards.find((c) => c.id === value)?.name
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CASH}>À vista</SelectItem>
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
              {isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
