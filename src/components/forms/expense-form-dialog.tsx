"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil } from "lucide-react";
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
import { createFixedExpense, updateFixedExpense } from "@/lib/actions/expense";

const NONE = "__none__";

type ExpenseValues = {
  id: string;
  label: string;
  amount: number;
  dueDay: number;
  cardId?: string | null;
};

export function ExpenseFormDialog({
  expense,
  cards = [],
}: {
  expense?: ExpenseValues;
  cards?: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [cardId, setCardId] = useState<string>(expense?.cardId ?? NONE);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!expense;

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        if (isEdit) {
          await updateFixedExpense(expense.id, formData);
        } else {
          await createFixedExpense(formData);
        }
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          isEdit ? (
            <Button variant="ghost" size="icon" aria-label="Editar despesa" />
          ) : (
            <Button className="gap-2" />
          )
        }
      >
        {isEdit ? (
          <Pencil className="size-4" />
        ) : (
          <>
            <Plus className="size-4" /> Nova despesa
          </>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar despesa fixa" : "Nova despesa fixa"}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="label">Nome</Label>
            <Input
              id="label"
              name="label"
              placeholder="Aluguel"
              defaultValue={expense?.label}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="amount">Valor</Label>
              <CurrencyInput id="amount" name="amount" defaultValue={expense?.amount} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="dueDay">Dia do vencimento</Label>
              <Input
                id="dueDay"
                name="dueDay"
                type="number"
                inputMode="numeric"
                min="1"
                max="31"
                defaultValue={expense?.dueDay}
                required
              />
            </div>
          </div>
          {cards.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="cardId">Cartão</Label>
              <input type="hidden" name="cardId" value={cardId === NONE ? "" : cardId} />
              <Select value={cardId} onValueChange={(v) => setCardId(v as string)}>
                <SelectTrigger id="cardId" className="w-full">
                  <SelectValue>
                    {(value: string) =>
                      value === NONE ? "Nenhum" : cards.find((c) => c.id === value)?.name
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nenhum</SelectItem>
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
