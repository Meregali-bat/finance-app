"use client";

import { useState, useTransition } from "react";
import { ArrowDownToLine } from "lucide-react";
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
import { depositToJar } from "@/lib/actions/jar";

export function JarDepositDialog({ jarId, jarName }: { jarId: string; jarName: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await depositToJar(jarId, formData);
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao guardar");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="secondary" size="sm" className="gap-2" />}>
        <ArrowDownToLine className="size-4" /> Guardar
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Guardar em &ldquo;{jarName}&rdquo;</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="amount">Valor (R$)</Label>
            <Input
              id="amount"
              name="amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="note">Nota (opcional)</Label>
            <Input id="note" name="note" placeholder="Sobra de julho" />
          </div>
          {error && (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
