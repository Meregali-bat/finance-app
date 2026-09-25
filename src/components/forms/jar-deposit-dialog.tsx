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

/**
 * Guardar e resgatar são o mesmo formulário com a direção trocada: o resgate
 * vira um depósito negativo no servidor.
 */
export function JarDepositDialog({
  jarId,
  jarName,
  mode = "deposit",
}: {
  jarId: string;
  jarName: string;
  mode?: "deposit" | "withdraw";
}) {
  const withdraw = mode === "withdraw";
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await (withdraw ? withdrawFromJar : depositToJar)(jarId, formData);
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant={withdraw ? "ghost" : "secondary"} size="sm" className="gap-2" />}
      >
        {withdraw ? (
          <>
            <ArrowUpFromLine className="size-4" /> Resgatar
          </>
        ) : (
          <>
            <ArrowDownToLine className="size-4" /> Guardar
          </>
        )}
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
