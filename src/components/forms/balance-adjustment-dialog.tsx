"use client";

import { useEffect, useState, useTransition } from "react";
import { Pencil } from "lucide-react";
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
import { setAccountBalance } from "@/lib/actions/account-balance";
import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/format";

/** "2026-10-16", no fuso local: o formato dos parâmetros do Histórico. */
const dayParam = (date: Date) => date.toLocaleDateString("en-CA");
import { cn } from "@/lib/utils";
import { iconButton } from "@/components/ui/icon-button";
import { errorMessage } from "@/lib/error-message";

/**
 * O campo abre preenchido com o valor que o app calculou, exceto quando esse
 * valor é exatamente zero — aí o `CurrencyInput` abre vazio, como em qualquer
 * outro formulário. Preencher é o caso comum: quem vem corrigir o saldo quase
 * sempre parte do que o app mostra, não do zero. A contrapartida — decisão do
 * usuário, ciente do trade-off — é que dá para confirmar sem abrir o banco,
 * o oposto do que este ajuste existe para forçar. Aceito assim mesmo.
 */
export function BalanceAdjustmentDialog({
  currentBalance,
  registeredMovement,
  stale = false,
  openOnHash,
  checkedAt = null,
}: {
  currentBalance: number | null;
  registeredMovement: number;
  /** O saldo pede conferência: o lápis ganha o texto "Atualizar" ao lado. */
  stale?: boolean;
  /**
   * Abre sozinho quando o endereço chega com esse "#": o "Conferir o saldo" do
   * hero termina na ação, e não num card a procurar. Sem JS, o link só rola
   * até o card, que leva o mesmo id.
   */
  openOnHash?: string;
  /** Quando o saldo foi conferido pela última vez, para o diálogo dizer. */
  checkedAt?: Date | null;
}) {
  const hasBalance = currentBalance != null;
  const showText = stale && hasBalance;
  // Com o saldo velho, o verbo é o do aviso ("Conferir o saldo", "Confira com
  // o extrato"): o mesmo diálogo não pode ter dois nomes.
  const triggerLabel = showText ? "Conferir saldo" : hasBalance ? "Atualizar saldo" : "Informar saldo";
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sign, setSign] = useState<"positivo" | "negativo">(
    currentBalance != null && currentBalance < 0 ? "negativo" : "positivo",
  );

  useEffect(() => {
    if (!openOnHash) return;
    const check = () => {
      if (window.location.hash !== `#${openOnHash}`) return;
      setSign(currentBalance != null && currentBalance < 0 ? "negativo" : "positivo");
      setOpen(true);
      // Limpo do endereço: o mesmo link precisa abrir de novo no próximo toque.
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, [openOnHash, currentBalance]);

  function handleSubmit(formData: FormData) {
    setError(null);
    formData.set("sign", sign);
    startTransition(async () => {
      try {
        await setAccountBalance(formData);
        setOpen(false);
      } catch (e) {
        setError(errorMessage(e, "Erro ao salvar"));
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Reabrir tem que voltar ao sinal do saldo atual: sem isto o dialog
        // guardaria o "negativo" de uma correção anterior, e o próximo ajuste
        // sairia invertido sem o usuário perceber.
        if (next) {
          setSign(currentBalance != null && currentBalance < 0 ? "negativo" : "positivo");
        }
      }}
    >
      <DialogTrigger
        render={
          <button
            type="button"
            className={iconButton({ size: showText ? "pill" : "md" })}
            aria-label={triggerLabel}
            // Com texto visível, a dica do ponteiro só repetiria o botão.
            title={showText ? undefined : triggerLabel}
          />
        }
      >
        <Pencil aria-hidden="true" />
        {/* Com o saldo velho, a ação se lê sozinha: o aviso ao lado pede
            conferência, e o botão diz o que fazer com ela. */}
        {showText && "Conferir"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{showText ? "Conferir saldo em conta" : "Saldo em conta"}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="balance">Quanto o banco mostra agora</Label>
            <p className="text-sm text-muted-foreground tabular-nums">
              {/* Aberto pelo aviso, o diálogo diz por que abriu: o valor
                  preenchido é uma estimativa, não o que o banco mostra. */}
              {currentBalance != null
                ? stale && checkedAt
                  ? `Com base no saldo conferido em ${formatDate(checkedAt)}, o app calculou ${formatCurrency(currentBalance)}.`
                  : `O app calculou ${formatCurrency(currentBalance)}.`
                : `Movimentação registrada até hoje: ${formatCurrency(registeredMovement)} — não é o saldo do banco, só o que passou pelo app.`}
            </p>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
              <button
                type="button"
                onClick={() => setSign("positivo")}
                className={cn(
                  "rounded-lg py-2 text-sm font-medium transition-colors duration-150",
                  sign === "positivo"
                    ? "bg-card text-primary shadow-surface ring-1 ring-foreground/10"
                    : "text-muted-foreground",
                )}
              >
                Positivo
              </button>
              <button
                type="button"
                onClick={() => setSign("negativo")}
                className={cn(
                  "rounded-lg py-2 text-sm font-medium transition-colors duration-150",
                  sign === "negativo"
                    ? "bg-card text-negative shadow-surface ring-1 ring-foreground/10"
                    : "text-muted-foreground",
                )}
              >
                Negativo
              </button>
            </div>
            <CurrencyInput
              key={open ? "aberto" : "fechado"}
              id="balance"
              name="balance"
              defaultValue={currentBalance != null ? Math.abs(currentBalance) : undefined}
              required
            />
            <p className="text-sm text-muted-foreground">
              Abra o app do banco e digite o valor que aparece lá. Daqui para a frente o saldo se
              atualiza sozinho com os seus lançamentos.
            </p>
            {/* Se a estimativa não bate, o lançamento que faltou está entre
                o que o app somou desde a última conferência. */}
            {stale && checkedAt && (
              <Link
                href={`/historico?range=custom&from=${dayParam(checkedAt)}&to=${dayParam(new Date())}`}
                onClick={() => setOpen(false)}
                className="-my-3 inline-flex min-h-11 w-fit items-center text-sm font-medium underline decoration-border underline-offset-4 hover:decoration-current"
              >
                Ver o que entrou e saiu desde {formatDate(checkedAt)}
              </Link>
            )}
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
