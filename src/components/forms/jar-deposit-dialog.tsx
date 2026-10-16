"use client";

import { useState, useTransition } from "react";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
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
import { depositToJar, withdrawFromJar } from "@/lib/actions/jar";
import { iconButton } from "@/components/ui/icon-button";

/**
 * Guardar e resgatar são o mesmo formulário com a direção trocada: o resgate
 * vira um depósito negativo no servidor.
 */
export function JarDepositDialog({
  jarId,
  jarName,
  mode = "deposit",
  onDone,
  disabled,
}: {
  jarId: string;
  jarName: string;
  mode?: "deposit" | "withdraw";
  /** Depois de salvar, com o id do movimento e o valor — para o toast. */
  onDone?: (result: { depositId: string; amount: number }) => void;
  disabled?: boolean;
}) {
  const withdraw = mode === "withdraw";
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await (withdraw ? withdrawFromJar : depositToJar)(jarId, formData);
        setOpen(false);
        onDone?.({ depositId: result.depositId, amount: Number(formData.get("amount")) });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        disabled={disabled}
        render={
          <button
            type="button"
            className={iconButton({
              tone: withdraw ? "outline" : "solid",
              size: "lg",
              className: "h-10 w-auto flex-1 rounded-[14px]",
            })}
            aria-label={withdraw ? "Resgatar" : "Guardar"}
            title={withdraw ? "Resgatar" : "Guardar"}
          />
        }
      >
        {withdraw ? <ArrowUpFromLine aria-hidden="true" /> : <ArrowDownToLine aria-hidden="true" />}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {withdraw ? "Resgatar de" : "Guardar em"} &ldquo;{jarName}&rdquo;
          </DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="amount">Valor</Label>
            <CurrencyInput id="amount" name="amount" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="note">Nota (opcional)</Label>
            <Input
              id="note"
              name="note"
              placeholder={withdraw ? "Conserto do carro" : "Sobra de julho"}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? withdraw
                  ? "Resgatando..."
                  : "Guardando..."
                : withdraw
                  ? "Resgatar"
                  : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
