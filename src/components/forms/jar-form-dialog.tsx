"use client";

import { unwrap } from "@/lib/action-result";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
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
import { createJar } from "@/lib/actions/jar";
import { iconButton } from "@/components/ui/icon-button";
import { errorMessage } from "@/lib/error-message";

export function JarFormDialog() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        unwrap(await createJar(formData));
        setOpen(false);
      } catch (e) {
        setError(errorMessage(e, "Erro ao salvar"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className={iconButton({ tone: "cta", size: "lg" })}
            aria-label="Nova caixinha"
            title="Nova caixinha"
          />
        }
      >
        <Plus aria-hidden="true" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova caixinha</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" name="name" placeholder="Viagem" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cdiPercent">Rende do CDI (opcional)</Label>
            <div className="relative">
              <Input
                id="cdiPercent"
                name="cdiPercent"
                inputMode="decimal"
                placeholder="100"
                className="pr-8 tabular-nums"
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground">
                %
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Vazio, ela não mostra rendimento. Dá para mudar depois.
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
