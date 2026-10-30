"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/currency-input";
import { Input } from "@/components/ui/input";
import { formatCurrency, todayInputValue } from "@/lib/format";
import type { IconTrigger } from "@/components/ui/icon-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { errorMessage } from "@/lib/error-message";

const ACCOUNT = "__account__";

export function ConfirmPaymentDialog({
  action,
  label,
  dueDate,
  amount,
  cards,
  allowPartial = false,
  paidSoFar = 0,
  trigger,
  triggerText,
  onDone,
}: {
  /** A server action já ligada ao id da despesa ou do cartão pelo `.bind`. */
  action: (formData: FormData) => Promise<{ paymentId: string }>;
  label: string;
  dueDate: Date;
  amount: number;
  /** Só para despesa fixa: permite dizer que aquele mês foi pago no cartão. */
  cards?: { id: string; name: string }[];
  /**
   * Despesa fixa e fatura: troca o "Confirmar" por "Pagar parcial", que
   * abate o valor e mantém o lembrete, e "Pagar e finalizar", que quita.
   */
  allowPartial?: boolean;
  /** O que os parciais anteriores já pagaram; `amount` é só o que falta. */
  paidSoFar?: number;
  trigger?: IconTrigger;
  /** O texto do botão padrão, quando "Marcar como paga" não diz qual. */
  triggerText?: string;
  /**
   * Depois de salvar, com o id do pagamento — o "Desfazer" da Início usa — e
   * se ele quitou a ocorrência ou foi parcial.
   */
  onDone?: (result: { paymentId: string; settled: boolean }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [cardId, setCardId] = useState(ACCOUNT);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Qual dos dois botões enviou o form. Um ref, e não estado: o clique roda
  // antes do envio, mas o estado só mudaria no próximo render.
  const settleRef = useRef(true);
  // Mais que o devido pede um segundo clique: um zero a mais (R$ 4.283,30 no
  // lugar de R$ 428,33) tiraria do saldo o que nunca saiu.
  // Qual botão está salvando, para o "Salvando..." aparecer no certo.
  const [savingKind, setSavingKind] = useState<"partial" | "full">("full");
  const [overConfirmed, setOverConfirmed] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    const typed = String(formData.get("amount") ?? "");
    if (Number(typed) > amount + 0.005 && overConfirmed !== typed) {
      setOverConfirmed(typed);
      setError(`Isso é mais que o que falta (${formatCurrency(amount)}). Se pagou mesmo esse valor, confirme de novo.`);
      return;
    }
    // Um "parcial" que cobre tudo o que falta quita: senão a fatura ficava
    // "falta R$ 0,00" e continuava sendo a próxima a pagar.
    const covers = Number(formData.get("amount")) + 0.005 >= amount;
    const settled = !allowPartial || settleRef.current || covers;
    formData.set("settle", settled ? "1" : "0");
    setSavingKind(settled ? "full" : "partial");
    startTransition(async () => {
      try {
        const result = await action(formData);
        setOpen(false);
        onDone?.({ ...result, settled });
      } catch (e) {
        setError(errorMessage(e, "Erro ao salvar"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger
          render={
            <button
              type="button"
              className={trigger.className}
              aria-label={trigger.label}
              title={trigger.label}
            />
          }
        >
          {trigger.icon}
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button size="sm" variant="secondary" />}>
          {triggerText ?? "Marcar como paga"}
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar pagamento</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{label}</p>
          {paidSoFar > 0 && (
            <p className="text-sm text-muted-foreground">
              Já pago: {formatCurrency(paidSoFar)} · falta {formatCurrency(amount)}
            </p>
          )}
          {/*
            O instante exato, não uma string "YYYY-MM-DD": formatar a data
            aqui a renderizaria no fuso do browser, o que pode cair um dia
            fora do vencimento que o servidor calculou.
          */}
          <input type="hidden" name="dueDate" value={dueDate.toISOString()} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="payment-amount">Valor pago</Label>
            <CurrencyInput id="payment-amount" name="amount" defaultValue={amount} required />
          </div>
          {/*
            O dia em que o dinheiro saiu. Com a data do clique, uma conta paga
            antes da última correção de saldo sairia dele de novo.
          */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="payment-date">Pago em</Label>
            <Input
              id="payment-date"
              name="paidOn"
              type="date"
              defaultValue={todayInputValue()}
              max={todayInputValue()}
              required
            />
          </div>
          {cards && cards.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="payment-card">Como foi pago</Label>
              <input type="hidden" name="cardId" value={cardId === ACCOUNT ? "" : cardId} />
              <Select value={cardId} onValueChange={(v) => setCardId(v as string)}>
                <SelectTrigger id="payment-card" className="w-full">
                  <SelectValue>
                    {(value: string) =>
                      value === ACCOUNT ? "Conta corrente" : cards.find((c) => c.id === value)?.name
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ACCOUNT}>Conta corrente</SelectItem>
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
            {allowPartial ? (
              <>
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={isPending}
                  onClick={() => (settleRef.current = false)}
                >
                  {isPending && savingKind === "partial" ? "Salvando..." : "Pagar parcial"}
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  onClick={() => (settleRef.current = true)}
                >
                  {isPending && savingKind === "full" ? "Salvando..." : "Pagar e finalizar"}
                </Button>
              </>
            ) : (
              <Button type="submit" disabled={isPending}>
                {isPending ? "Salvando..." : "Confirmar"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
