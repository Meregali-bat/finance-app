"use client";

import { useState, useTransition } from "react";
import { CalendarPlus } from "lucide-react";
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
import { iconButton } from "@/components/ui/icon-button";
import { errorMessage } from "@/lib/error-message";

/** Um vencimento oferecido no seletor: valor em ISO, rótulo já formatado. */
export type DueDateOption = { value: string; label: string };

export function CardBillEstimateDialog({
  cardId,
  dueDates,
  defaultDueDate,
}: {
  cardId: string;
  dueDates: DueDateOption[];
  /** A fatura que o formulário abre escolhida; sem ela, a primeira. */
  defaultDueDate?: string;
}) {
  const initialDueDate =
    dueDates.find((d) => d.value === defaultDueDate)?.value ?? dueDates[0]?.value ?? "";
  const [open, setOpen] = useState(false);
  const [chosenDueDate, setDueDate] = useState<string>(initialDueDate);
  // Paga a fatura escolhida (na mesma tela), a escolha cai para a próxima em
  // aberto: senão o campo ficava em branco e a previsão ia para a paga.
  const dueDate = dueDates.some((d) => d.value === chosenDueDate) ? chosenDueDate : initialDueDate;
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await createCardBillEstimate(cardId, formData);
        setOpen(false);
        setDueDate(initialDueDate);
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
            // Com rótulo, como o "Nova compra" ao lado: só o ícone de
            // calendário não dizia o que fazia.
            className={iconButton({
              tone: "outline",
              size: "xl",
              className: "w-auto gap-2 px-4 text-sm font-semibold",
            })}
            // Sem fatura em aberto, não há onde prever: o campo iria vazio.
            disabled={dueDates.length === 0}
            title={
              dueDates.length === 0
                ? "Nenhuma fatura em aberto para prever"
                : "Prever valor na fatura"
            }
          />
        }
      >
        <CalendarPlus aria-hidden="true" />
        Prever valor
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
