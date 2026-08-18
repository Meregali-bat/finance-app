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
import { createCardBillEstimate } from "@/lib/actions/card-bill-estimate";

/** Um vencimento oferecido no seletor: valor em ISO, rótulo já formatado. */
export type DueDateOption = { value: string; label: string };

export function CardBillEstimateDialog({
  cardId,
  dueDates,
}: {
  cardId: string;
  dueDates: DueDateOption[];
}) {
  const [open, setOpen] = useState(false);
  const [dueDate, setDueDate] = useState<string>(dueDates[0]?.value ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await createCardBillEstimate(cardId, formData);
        setOpen(false);
        setDueDate(dueDates[0]?.value ?? "");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" className="gap-2 lg:w-fit" />}>
        <Plus className="size-4" /> Prever valor na fatura
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Prever valor na fatura</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Descrição</Label>
            <Input id="description" name="description" placeholder="Anuidade" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="amount">Valor</Label>
            <CurrencyInput id="amount" name="amount" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="dueDate">Vencimento</Label>
            {/* Um seletor fechado, e não um <input type="date"> livre: uma data
                que não é vencimento de nenhuma fatura não casaria com fatura
                alguma, e a previsão sumiria em silêncio. */}
            <input type="hidden" name="dueDate" value={dueDate} />
            <Select value={dueDate} onValueChange={(v) => setDueDate(v as string)}>
              <SelectTrigger id="dueDate" className="w-full">
                <SelectValue>
                  {(value: string) => dueDates.find((d) => d.value === value)?.label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {dueDates.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              O valor soma ao que as compras já calculam para essa fatura.
            </p>
          </div>
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
