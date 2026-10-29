"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, ChevronDown, HandCoins } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/currency-input";
import { SectionLabel } from "@/components/page-header";
import { UndoToast, type UndoToastState } from "@/components/undo-toast";
import { iconButton } from "@/components/ui/icon-button";
import { homeCard } from "@/components/home-card";
import { receiveLoanPayment } from "@/lib/actions/loan";
import { deleteTransaction } from "@/lib/actions/transaction";
import { formatCurrency, todayInputValue } from "@/lib/format";
import type { DebtView } from "@/lib/loans-data";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/error-message";

const TOAST_MS = 4000;

/**
 * "A receber": quem te deve, uma linha por pessoa com o total em aberto. Tocar
 * abre os empréstimos dela; "Recebi" registra o que ela devolveu, que abate
 * do mais antigo para o mais novo e oferece "Desfazer".
 */
export function HomeDebts({ debts }: { debts: DebtView[] }) {
  const [toast, setToast] = useState<(UndoToastState & { transactionId: string }) | null>(null);
  const [undoing, startUndo] = useTransition();
  const seq = useRef(0);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(t);
  }, [toast]);

  if (debts.length === 0 && !toast) return null;

  const total = debts.reduce((sum, d) => sum + d.remaining, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <SectionLabel>A receber</SectionLabel>
        {debts.length > 1 && (
          <span className="text-xs font-semibold text-muted-foreground tabular-nums">
            {formatCurrency(total)}
          </span>
        )}
      </div>
      <ul className="flex flex-col gap-2.5">
        {debts.map((debt) => (
          <li key={debt.personId}>
            <DebtCard
              debt={debt}
              onReceived={(transactionId, amount) =>
                setToast({
                  id: ++seq.current,
                  transactionId,
                  hasUndo: true,
                  text: `${formatCurrency(amount)} recebidos de ${debt.name}`,
                })
              }
            />
          </li>
        ))}
      </ul>
      <UndoToast
        toast={toast}
        undoing={undoing}
        onUndo={() => {
          if (!toast) return;
          const { transactionId } = toast;
          setToast(null);
          // Apagar a receita apaga o recebimento junto, e a dívida volta.
          startUndo(() => deleteTransaction(transactionId));
        }}
      />
    </div>
  );
}

function DebtCard({
  debt,
  onReceived,
}: {
  debt: DebtView;
  onReceived: (transactionId: string, amount: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className={homeCard("flex flex-col gap-2.5 py-3.5 pr-3.5 pl-4 lg:py-3.5 lg:pr-3.5 lg:pl-4")}
    >
      {/* No celular o "Recebi" desce para uma linha só dele, na ponta direita,
          como o "Pagar" dos lembretes: deixa livre a coluna do "+" fixo (58px
          a 16px da borda) e devolve ao texto a largura toda. Ao lado do texto,
          com o recuo do "+", o "te deve…" ficaria com menos de 90px em 360. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:flex-nowrap">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-sm:basis-full"
        >
          <span
            aria-hidden="true"
            className="flex size-[38px] shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary"
          >
            <HandCoins className="size-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[15px] font-semibold">{debt.name}</span>
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-out-quint",
                  expanded && "rotate-180",
                )}
              />
            </span>
            <span
              className={cn(
                "block text-[13px] tabular-nums",
                debt.overdue ? "text-negative" : "text-muted-foreground",
              )}
            >
              te deve {formatCurrency(debt.remaining)} · {debt.detail}
            </span>
          </span>
        </button>
        <div className="flex max-sm:w-full max-sm:justify-end max-sm:pr-14">
          <ReceiveDialog debt={debt} onReceived={onReceived} />
        </div>
      </div>
      {expanded && (
        <ul className="flex flex-col gap-2 border-t border-border/60 pt-2.5 pl-[50px] text-[13px]">
          {debt.loans.map((loan) => (
            <li key={loan.id} className={cn("flex flex-col", loan.settled && "opacity-50")}>
              <span className="truncate font-medium">{loan.label}</span>
              <span className="text-muted-foreground tabular-nums">{loan.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReceiveDialog({
  debt,
  onReceived,
}: {
  debt: DebtView;
  onReceived: (transactionId: string, amount: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        const { transactionId } = await receiveLoanPayment(debt.personId, formData);
        setOpen(false);
        onReceived(transactionId, Number(formData.get("amount")));
      } catch (e) {
        setError(errorMessage(e, "Erro ao salvar"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          // O mesmo "Recebi" com texto dos lembretes: só o ícone se confundia
          // com o avatar da linha. O nome acessível começa pelo texto visível.
          <button
            type="button"
            className={iconButton({ size: "pill" })}
            aria-label={`Recebi: ${debt.name}`}
          />
        }
      >
        <Check aria-hidden="true" strokeWidth={2.5} />
        Recebi
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recebi de {debt.name}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground tabular-nums">
            Ainda deve {formatCurrency(debt.remaining)}. O que entrar abate os empréstimos mais
            antigos primeiro; se vier a mais, entra todo como receita.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="repay-amount">Valor</Label>
              <CurrencyInput
                id="repay-amount"
                name="amount"
                defaultValue={debt.suggested}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="repay-date">Recebido em</Label>
              <Input
                id="repay-date"
                name="date"
                type="date"
                defaultValue={todayInputValue()}
                max={todayInputValue()}
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
              {isPending ? "Salvando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
