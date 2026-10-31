"use client";

import { useState, useTransition } from "react";
import { FastForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/currency-input";
import { iconButton } from "@/components/ui/icon-button";
import { advanceInstallments } from "@/lib/actions/installment-advance";
import { unwrap } from "@/lib/action-result";
import { errorMessage } from "@/lib/error-message";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Installment {
  number: number;
  /** "YYYY-MM-DD". */
  dueDate: string;
  amount: number;
}

/** "2026-11-10" → "10/11/26". */
const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Adiantar parcelas de uma conta fixa: escolher quais (quaisquer, não só as
 * próximas) e dizer quanto o banco cobrou por elas — às vezes menos que a
 * soma, pelo desconto dos juros. O dinheiro sai hoje.
 */
export function AdvanceInstallmentsDialog({
  expenseId,
  label,
  total,
  installments,
}: {
  expenseId: string;
  label: string;
  /** Quantas parcelas o contrato tem, para o "5 de 12". */
  total: number;
  installments: Installment[];
}) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  // O valor pago acompanha a soma até a pessoa digitar o do banco.
  const [paid, setPaid] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const sum = round2(
    installments.filter((i) => chosen.has(i.dueDate)).reduce((s, i) => s + i.amount, 0),
  );
  const value = paid ?? sum;
  const discount = round2(sum - value);

  function reset(next: boolean) {
    setOpen(next);
    if (next) {
      setChosen(new Set());
      setPaid(null);
      setError(null);
      setDone(null);
    }
  }

  function toggle(dueDate: string) {
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(dueDate)) next.delete(dueDate);
      else next.add(dueDate);
      return next;
    });
  }

  function submit() {
    setError(null);
    start(async () => {
      try {
        const result = unwrap(
          await advanceInstallments(expenseId, { dueDates: [...chosen], paid: value }),
        );
        setDone(
          `${result.count === 1 ? "1 parcela adiantada" : `${result.count} parcelas adiantadas`}` +
            (result.discount > 0 ? `, com ${formatCurrency(result.discount)} de desconto.` : "."),
        );
        setChosen(new Set());
        setPaid(null);
      } catch (e) {
        setError(errorMessage(e, "Não deu para adiantar. Tente de novo."));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger
        render={
          <button
            type="button"
            className={iconButton({ tone: "ghost", size: "sm" })}
            aria-label={`Adiantar parcelas de ${label}`}
            title="Adiantar parcelas"
          />
        }
      >
        <FastForward aria-hidden="true" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adiantar parcelas</DialogTitle>
        </DialogHeader>
        {done ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm">{done} O valor saiu hoje e esses meses não cobram mais.</p>
            <DialogFooter>
              <Button type="button" onClick={() => setOpen(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              {label} · escolha as parcelas que você vai pagar agora.
            </p>
            <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
              {installments.map((i) => {
                const on = chosen.has(i.dueDate);
                return (
                  <li key={i.dueDate}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggle(i.dueDate)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                        on ? "border-primary bg-primary/5" : "border-border hover:bg-muted",
                      )}
                    >
                      <span>
                        <span className="font-medium">
                          Parcela {i.number} de {total}
                        </span>
                        <span className="text-muted-foreground"> · vence {shortDate(i.dueDate)}</span>
                      </span>
                      <span className="tabular-nums">{formatCurrency(i.amount)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-col gap-2">
              <Label htmlFor="advance-paid">Valor pago ao banco</Label>
              <CurrencyInput
                // Remonta com a soma enquanto a pessoa não digitou o dela.
                key={paid === null ? `sum-${sum}` : "edited"}
                id="advance-paid"
                name="paid"
                defaultValue={value}
                onValueChange={setPaid}
              />
              <p className="text-xs text-muted-foreground tabular-nums">
                {chosen.size === 0
                  ? "Marque ao menos uma parcela."
                  : `Soma das parcelas: ${formatCurrency(sum)}` +
                    (discount > 0.004
                      ? ` · desconto de ${formatCurrency(discount)}`
                      : discount < -0.004
                        ? ` · ${formatCurrency(-discount)} a mais que a soma`
                        : "")}
              </p>
            </div>
            {error && (
              <p role="alert" className="text-sm text-negative">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                onClick={submit}
                disabled={pending || chosen.size === 0 || value <= 0}
              >
                {pending
                  ? "Adiantando..."
                  : chosen.size > 0
                    ? `Adiantar ${chosen.size} por ${formatCurrency(value)}`
                    : "Adiantar"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
