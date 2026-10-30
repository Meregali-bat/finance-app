"use client";

import { unwrap } from "@/lib/action-result";
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
import { CurrencyInput } from "@/components/currency-input";
import { createIncome, updateIncome } from "@/lib/actions/income";
import { iconButton } from "@/components/ui/icon-button";
import { errorMessage } from "@/lib/error-message";

type IncomeValues = {
  id: string;
  label: string;
  amount: number;
  dayOfMonth: number;
};

export function IncomeFormDialog({ income }: { income?: IncomeValues }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!income;

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        if (isEdit) {
          unwrap(await updateIncome(income.id, formData));
        } else {
          unwrap(await createIncome(formData));
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
            aria-label={isEdit ? `Editar ${income.label}` : "Nova renda"}
            title={isEdit ? `Editar ${income.label}` : "Nova renda"}
          />
        }
      >
        {isEdit ? <Pencil aria-hidden="true" /> : <Plus aria-hidden="true" />}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar renda" : "Nova renda"}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="label">Nome</Label>
            <Input
              id="label"
              name="label"
              placeholder="Salário"
              defaultValue={income?.label}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="amount">Valor</Label>
              <CurrencyInput id="amount" name="amount" defaultValue={income?.amount} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="dayOfMonth">Dia do mês</Label>
              <Input
                id="dayOfMonth"
                name="dayOfMonth"
                type="number"
                inputMode="numeric"
                min="1"
                max="31"
                defaultValue={income?.dayOfMonth}
                required
              />
            </div>
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
