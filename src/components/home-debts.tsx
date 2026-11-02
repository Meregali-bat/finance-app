"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
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
import { forgiveLoans, receiveLoanPayment, unforgiveLoans } from "@/lib/actions/loan";
import { unwrap } from "@/lib/action-result";
import { deleteTransaction } from "@/lib/actions/transaction";
import { formatCurrency, todayInputValue } from "@/lib/format";
import type { DebtView } from "@/lib/loans-data";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/error-message";

/**
 * "A receber": quem te deve, uma linha por pessoa com o total em aberto. Tocar
 * abre os empréstimos dela; "Recebi" registra o que ela devolveu, que abate
 * do mais antigo para o mais novo e oferece "Desfazer".
 */
export function HomeDebts({ debts }: { debts: DebtView[] }) {
  // O "Desfazer" de cada ação: apagar a receita do recebimento, ou devolver o
  // que foi dado como perdido.
  const [toast, setToast] = useState<(UndoToastState & { undo: () => Promise<unknown> }) | null>(
    null,
  )
  const [undoing, startUndo] = useTransition();
  const seq = useRef(0);
  const heading = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  // De quem foi o último recebimento: o foco volta para a linha dela quando o
  // toast sai com ele dentro. Num ref, porque nessa hora o toast já é `null`.
  const lastPerson = useRef<string | null>(null);

  if (debts.length === 0 && !toast) return null;

  const total = debts.reduce((sum, d) => sum + d.remaining, 0);

  return (
    <div className="@container flex flex-col gap-3">
      <div
        ref={heading}
        tabIndex={-1}
        className="-mx-1 flex items-baseline justify-between gap-2 rounded-lg px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <SectionLabel>A receber</SectionLabel>
        <span className="flex items-baseline gap-3">
          {debts.length > 1 && (
            <span className="text-xs font-semibold text-muted-foreground tabular-nums">
              {formatCurrency(total)}
            </span>
          )}
          {/* O histórico todo, inclusive quem já pagou e o que foi perdido. */}
          <Link
            href="/historico/emprestimos"
            className="-my-3 py-3 text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            Ver relatório
          </Link>
        </span>
      </div>
      {/* Com a faixa toda do desktop (sem os avisos ao lado), duas colunas:
          uma linha de 980px deixava o "Recebi" longe do nome. */}
      <ul ref={list} className="grid gap-2.5 @3xl:grid-cols-2 @3xl:gap-x-4">
        {debts.map((debt) => (
          <li key={debt.personId} data-person-id={debt.personId}>
            <DebtCard
              debt={debt}
              onReceived={(transactionId, amount) => {
                lastPerson.current = debt.personId;
                setToast({
                  id: ++seq.current,
                  // Apagar a receita apaga o recebimento junto, e a dívida volta.
                  undo: () => deleteTransaction(transactionId),
                  hasUndo: true,
                  text: `${formatCurrency(amount)} recebidos de ${debt.name}`,
                });
              }}
              onForgiven={(loanIds, amount) => {
                lastPerson.current = debt.personId;
                setToast({
                  id: ++seq.current,
                  undo: () => unforgiveLoans({ loanIds }),
                  hasUndo: true,
                  text: `${formatCurrency(amount)} de ${debt.name} dados como perdidos`,
                });
              }}
            />
          </li>
        ))}
      </ul>
      <UndoToast
        toast={toast}
        undoing={undoing}
        onDismiss={() => setToast(null)}
        // A linha da pessoa, se ela ainda deve; senão (quitou), o título.
        restoreFocus={() =>
          Array.from(list.current?.children ?? [])
            .find((li) => (li as HTMLElement).dataset.personId === lastPerson.current)
            ?.querySelector("button") ?? heading.current
        }
        onUndo={() => {
          if (!toast) return;
          const { undo } = toast;
          setToast(null);
          startUndo(async () => {
            await undo();
          });
        }}
      />
    </div>
  );
}

function DebtCard({
  debt,
  onReceived,
  onForgiven,
}: {
  debt: DebtView;
  onReceived: (transactionId: string, amount: number) => void;
  onForgiven: (loanIds: string[], amount: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className={homeCard("flex h-full flex-col justify-center gap-2.5 py-3.5 pr-3.5 pl-4 lg:py-3.5 lg:pr-3.5 lg:pl-4")}
    >
      {/* No celular o "Recebi" vira o rodapé do card, como o "Pagar" dos
          lembretes, e o texto fica com a largura toda. */}
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
        {/* Solto embaixo do nome, o botão parecia boiar no card: no celular
            ele ocupa a largura, com uma linha fina em cima. */}
        <div className="flex max-sm:w-full max-sm:border-t max-sm:border-(--hairline) max-sm:pt-3 max-sm:[&>button]:w-full">
          <ReceiveDialog debt={debt} onReceived={onReceived} />
        </div>
      </div>
      {expanded && (
        <div className="flex flex-col gap-2 border-t border-border/60 pt-2.5 pl-[50px]">
          <ul className="flex flex-col gap-2 text-[13px]">
            {debt.loans.map((loan) => (
              <li key={loan.id} className={cn("flex flex-col", loan.settled && "opacity-50")}>
                <span className="truncate font-medium">{loan.label}</span>
                <span className="text-muted-foreground tabular-nums">{loan.detail}</span>
              </li>
            ))}
          </ul>
          {/* Dentro dos empréstimos, e não ao lado do "Recebi": é uma decisão
              rara, sobre títulos específicos, e não deve competir com ele. */}
          <ForgiveDialog debt={debt} onForgiven={onForgiven} />
        </div>
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

/**
 * "Não vai pagar": escolher quais empréstimos da pessoa dar como perdidos. O
 * que falta deles sai do que ela deve e passa a contar como gasto seu.
 */
function ForgiveDialog({
  debt,
  onForgiven,
}: {
  debt: DebtView;
  onForgiven: (loanIds: string[], amount: number) => void;
}) {
  const open = debt.loans.filter((l) => l.remaining > 0.005);
  const [isOpen, setIsOpen] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (open.length === 0) return null;

  const total = open.filter((l) => chosen.has(l.id)).reduce((sum, l) => sum + l.remaining, 0);

  function toggle(id: string) {
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        setIsOpen(next);
        if (next) {
          // Com um empréstimo só, ele já vem marcado; com vários, a pessoa escolhe.
          setChosen(new Set(open.length === 1 ? [open[0].id] : []));
          setError(null);
        }
      }}
    >
      <DialogTrigger
        render={
          <button
            type="button"
            className="-my-2 flex min-h-11 w-fit items-center text-[13px] font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          />
        }
      >
        {debt.name} não vai pagar…
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>O que {debt.name} não vai pagar</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Escolha os empréstimos. O que falta deles sai do que {debt.name} te deve e passa a
            contar como gasto seu.
          </p>
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
            {open.map((loan) => {
              const on = chosen.has(loan.id);
              return (
                <li key={loan.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggle(loan.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      on ? "border-primary bg-primary/5" : "border-border hover:bg-muted",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{loan.label}</span>
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        {loan.detail}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums">{formatCurrency(loan.remaining)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {error && (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              disabled={pending || chosen.size === 0}
              onClick={() =>
                start(async () => {
                  try {
                    setError(null);
                    const result = unwrap(await forgiveLoans(debt.personId, { loanIds: [...chosen] }));
                    setIsOpen(false);
                    onForgiven(result.loanIds, result.amount);
                  } catch (e) {
                    setError(errorMessage(e, "Não deu para salvar. Tente de novo."));
                  }
                })
              }
            >
              {pending
                ? "Salvando..."
                : chosen.size === 0
                  ? "Escolha os empréstimos"
                  : `Dar ${formatCurrency(total)} como perdido`}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
