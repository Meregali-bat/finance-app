"use client";

import { unwrap } from "@/lib/action-result";
import { useState, useTransition } from "react";
import { Plus, Pencil } from "lucide-react";
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
import { createCategory, updateCategory } from "@/lib/actions/category";
import { iconButton } from "@/components/ui/icon-button";
import { errorMessage } from "@/lib/error-message";

type CategoryValues = {
  id: string;
  name: string;
};

export function CategoryFormDialog({
  category,
  uses = 0,
}: {
  category?: CategoryValues;
  /** Em quantos lançamentos ela está: em uso, não se exclui, e aqui diz por quê. */
  uses?: number;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!category;

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        if (isEdit) {
          unwrap(await updateCategory(category.id, formData));
        } else {
          unwrap(await createCategory(formData));
        }
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
            className={
              isEdit
                ? iconButton({ tone: "ghost", size: "sm" })
                : iconButton({ tone: "cta", size: "lg" })
            }
            aria-label={isEdit ? `Editar ${category?.name}` : "Nova categoria"}
            title={isEdit ? `Editar ${category?.name}` : "Nova categoria"}
          />
        }
      >
        {isEdit ? <Pencil aria-hidden="true" /> : <Plus aria-hidden="true" />}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar categoria" : "Nova categoria"}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              name="name"
              placeholder="Alimentação"
              defaultValue={category?.name}
              required
              autoFocus
            />
          </div>
          {isEdit && uses > 0 && (
            <p className="text-xs text-muted-foreground">
              Está em {uses === 1 ? "1 lançamento" : `${uses} lançamentos`}, por isso não dá para
              excluir: o histórico ficaria sem categoria. Para tirá-la dos formulários, desative
              no interruptor da lista.
            </p>
          )}
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
