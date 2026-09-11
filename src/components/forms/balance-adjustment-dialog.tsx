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

/**
 * O campo abre vazio, sem o saldo calculado preenchido: o valor pedido é o que
 * o banco mostra, e oferecer o número do app de volta convida a confirmar sem
 * conferir — que é justamente o que este ajuste existe para evitar.
 */
export function BalanceAdjustmentDialog({ hasBalance }: { hasBalance: boolean }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
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
    <Dialog open={open} onOpenChange={setOpen}>
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
            <CurrencyInput id="balance" name="balance" required />
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
