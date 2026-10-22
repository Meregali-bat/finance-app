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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { CurrencyInput } from "@/components/currency-input";
import { createFixedExpense, updateFixedExpense } from "@/lib/actions/expense";
import { iconButton } from "@/components/ui/icon-button";
import { errorMessage } from "@/lib/error-message";

const NONE = "__none__";

type ExpenseValues = {
  id: string;
  label: string;
  amount: number;
  dueDay: number | null;
  cardId?: string | null;
  categoryId?: string | null;
  installmentCount?: number | null;
};

export function ExpenseFormDialog({
  expense,
  cards = [],
  categories = [],
}: {
  expense?: ExpenseValues;
  cards?: { id: string; name: string }[];
  categories?: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [cardId, setCardId] = useState<string>(expense?.cardId ?? NONE);
  const [categoryId, setCategoryId] = useState<string>(expense?.categoryId ?? NONE);
  // A cobrança deste mês já foi lançada como gasto comum ou compra no cartão:
  // a despesa começa na próxima, para não ficar em dobro.
  const [skipCurrent, setSkipCurrent] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!expense;
  const hasCard = cardId !== NONE;

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
        setError(errorMessage(e, "Erro ao salvar"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className={
              isEdit
                ? iconButton({ tone: "ghost", size: "sm" })
                : iconButton({ tone: "cta", size: "lg" })
            }
            aria-label={isEdit ? "Editar despesa" : "Nova despesa"}
            title={isEdit ? "Editar despesa" : "Nova despesa"}
          />
        }
      >
        {isEdit ? <Pencil aria-hidden="true" /> : <Plus aria-hidden="true" />}
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
          <div className={hasCard ? "flex flex-col gap-2" : "grid grid-cols-2 gap-4"}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="amount">Valor</Label>
              <CurrencyInput id="amount" name="amount" defaultValue={expense?.amount} required />
            </div>
            {!hasCard && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="dueDay">Dia do vencimento</Label>
                <Input
                  id="dueDay"
                  name="dueDay"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="31"
                  defaultValue={expense?.dueDay ?? undefined}
                  required
                />
              </div>
            )}
          </div>
          {hasCard ? (
            <p className="text-sm text-muted-foreground">
              O vencimento segue a fatura do cartão selecionado.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="installmentCount">Parcelas restantes (opcional)</Label>
              <Input
                id="installmentCount"
                name="installmentCount"
                type="number"
                inputMode="numeric"
                min="1"
                placeholder="Sem fim"
                defaultValue={expense?.installmentCount ?? undefined}
              />
              {/* Contadas a partir do próximo vencimento, que é o que quem
                  está no meio de um financiamento sabe dizer. */}
              <p className="text-xs text-muted-foreground">
                Para financiamentos e carnês, a partir do próximo vencimento. Permite adiar uma
                parcela para depois da última.
              </p>
            </div>
          )}
          {categories.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="categoryId">Categoria</Label>
              <input
                type="hidden"
                name="categoryId"
                value={categoryId === NONE ? "" : categoryId}
              />
              <Select value={categoryId} onValueChange={(v) => setCategoryId(v as string)}>
                <SelectTrigger id="categoryId" className="w-full">
                  <SelectValue>
                    {(value: string) =>
                      value === NONE
                        ? "Sem categoria"
                        : categories.find((c) => c.id === value)?.name
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
          {!isEdit && (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/60 p-3">
              <input type="hidden" name="skipCurrent" value={skipCurrent ? "1" : ""} />
              <div className="min-w-0">
                <Label htmlFor="skip-current">Já lancei a cobrança deste mês</Label>
                <p className="text-xs text-muted-foreground">
                  {hasCard
                    ? "Começa na próxima fatura: a que está aberta já tem a compra que você lançou."
                    : "Começa no próximo vencimento, para não contar duas vezes."}
                </p>
              </div>
              <Switch id="skip-current" checked={skipCurrent} onCheckedChange={setSkipCurrent} />
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
