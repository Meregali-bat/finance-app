"use client";

import { useState, useTransition } from "react";
import { Wallet } from "lucide-react";
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
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * O campo abre preenchido com o valor que o app calculou: quem vem corrigir o
 * saldo quase sempre parte dele, não do zero. A contrapartida — decisão do
 * usuário, ciente do trade-off — é que dá para confirmar sem abrir o banco,
 * o oposto do que este ajuste existe para forçar. Aceito assim mesmo.
 */
export function BalanceAdjustmentDialog({
  hasBalance,
  currentBalance,
  registeredMovement,
}: {
  hasBalance: boolean;
  currentBalance: number | null;
  registeredMovement: number;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sign, setSign] = useState<"positivo" | "negativo">(
    currentBalance != null && currentBalance < 0 ? "negativo" : "positivo",
  );

  function handleSubmit(formData: FormData) {
    setError(null);
    formData.set("sign", sign);
    startTransition(async () => {
      try {
        await setAccountBalance(formData);
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar");
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
      <DialogTrigger render={<Button variant="secondary" size="sm" className="gap-2" />}>
        <Wallet className="size-4" /> {hasBalance ? "Corrigir" : "Informar saldo"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Saldo em conta</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="balance">Quanto o banco mostra agora</Label>
            <p className="text-sm text-muted-foreground tabular-nums">
              {currentBalance != null
                ? `O app calculou ${formatCurrency(currentBalance)}.`
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
