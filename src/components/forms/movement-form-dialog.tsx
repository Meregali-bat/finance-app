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
import { cn } from "@/lib/utils";

const CASH = "__cash__";
const NONE = "__none__";

export function MovementFormDialog({
  cards,
  categories = [],
}: {
  cards: { id: string; name: string }[];
  categories?: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [cardId, setCardId] = useState<string>(CASH);
  const [categoryId, setCategoryId] = useState<string>(NONE);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        if (kind === "expense" && cardId !== CASH) {
          await createCardPurchase(cardId, formData);
        } else {
          formData.set("type", kind);
          await createTransaction(formData);
        }
        setOpen(false);
        setKind("expense");
        setCardId(CASH);
        setCategoryId(NONE);
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
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
            <button
              type="button"
              onClick={() => setKind("expense")}
              className={cn(
                "rounded-md py-1.5 text-sm font-medium transition-colors",
                kind === "expense" ? "bg-background shadow-sm" : "text-muted-foreground",
              )}
            >
              Despesa
            </button>
            <button
              type="button"
              onClick={() => {
                setKind("income");
                setCardId(CASH);
              }}
              className={cn(
                "rounded-md py-1.5 text-sm font-medium transition-colors",
                kind === "income" ? "bg-background shadow-sm" : "text-muted-foreground",
              )}
            >
              Receita
            </button>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Descrição</Label>
            <Input
              id="description"
              name="description"
              placeholder={kind === "expense" ? "Almoço" : "Freela"}
              required
              autoFocus
            />
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
          {kind === "expense" && cards.length > 0 && (
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
          {categories.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="categoryId">Categoria</Label>
              <input type="hidden" name="categoryId" value={categoryId === NONE ? "" : categoryId} />
              <Select value={categoryId} onValueChange={(v) => setCategoryId(v as string)}>
                <SelectTrigger id="categoryId" className="w-full">
                  <SelectValue>
                    {(value: string) =>
                      value === NONE ? "Sem categoria" : categories.find((c) => c.id === value)?.name
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem categoria</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
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
