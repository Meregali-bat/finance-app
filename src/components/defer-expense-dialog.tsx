"use client";

import { useState, useTransition } from "react";
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
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Mode = "nextMonth" | "end";

/**
 * Adiar uma ocorrência de despesa fixa em vez de pagá-la. O valor vem
 * preenchido com o da ocorrência e pode mudar (juros, multa); o destino é o
 * mês seguinte, somado à próxima, ou depois da última parcela.
 *
 * As duas datas chegam calculadas do servidor, pela mesma função que a action
 * usa para gravar o adiamento, para a tela prometer exatamente o que acontece.
 */
export function DeferExpenseDialog({
  action,
  label,
  dueDate,
  amount,
  nextMonthTarget,
  endTarget,
}: {
  /** `deferFixedExpense` já ligada ao id da despesa. */
  action: (formData: FormData) => Promise<void>;
  label: string;
  dueDate: Date;
  amount: number;
  nextMonthTarget: Date;
  /** Nulo quando a despesa não tem número de parcelas: não há "última". */
  endTarget: Date | null;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("nextMonth");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await action(formData);
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao adiar");
      }
    });
  }

  const options: { value: Mode; title: string; hint: string; disabled?: boolean }[] = [
    {
      value: "nextMonth",
      title: "Acumular no mês seguinte",
      hint: `Vence em ${formatDate(nextMonthTarget)}, somado à próxima`,
    },
    {
      value: "end",
      title: "Depois da última parcela",
      hint: endTarget
        ? `Vira uma cobrança extra em ${formatDate(endTarget)}`
        : "Só para despesas com número de parcelas — defina em Fixos",
      disabled: !endTarget,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="ghost" />}>Adiar</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adiar pagamento</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {label} · vence em {formatDate(dueDate)}
          </p>
          {/* O instante exato, como no "Marcar como paga": formatado aqui, a
              data poderia cair um dia fora do vencimento que o servidor
              calculou. */}
          <input type="hidden" name="dueDate" value={dueDate.toISOString()} />
          <input type="hidden" name="mode" value={mode} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="defer-amount">Valor adiado</Label>
            <CurrencyInput id="defer-amount" name="amount" defaultValue={amount} required />
          </div>
          <div className="flex flex-col gap-2" role="radiogroup" aria-label="Para onde vai">
            <Label>Para onde vai</Label>
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={mode === option.value}
                disabled={option.disabled}
                onClick={() => setMode(option.value)}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors",
                  mode === option.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted",
                  option.disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
                )}
              >
                <span className="text-sm font-medium">{option.title}</span>
                <span className="text-xs text-muted-foreground">{option.hint}</span>
              </button>
            ))}
          </div>
          {error && (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Adiando..." : "Adiar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
