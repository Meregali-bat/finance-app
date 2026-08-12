"use client";

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
import { createCreditCard, updateCreditCard } from "@/lib/actions/card";

type CardValues = {
  id: string;
  name: string;
  closingDay: number;
  dueDay: number;
};

export function CardFormDialog({ card }: { card?: CardValues }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!card;

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        if (isEdit) {
          await updateCreditCard(card.id, formData);
        } else {
          await createCreditCard(formData);
        }
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          isEdit ? (
            <Button variant="ghost" size="icon" aria-label="Editar cartão" />
          ) : (
            // Largura cheia no celular (alvo de toque); em telas largas volta
            // ao tamanho do texto, senão vira uma faixa verde de ponta a ponta.
            <Button className="gap-2 lg:w-fit" />
          )
        }
      >
        {isEdit ? (
          <Pencil className="size-4" />
        ) : (
          <>
            <Plus className="size-4" /> Novo cartão
          </>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar cartão" : "Novo cartão"}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              name="name"
              placeholder="Nubank"
              defaultValue={card?.name}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="closingDay">Dia do fechamento</Label>
              <Input
                id="closingDay"
                name="closingDay"
                type="number"
                inputMode="numeric"
                min="1"
                max="31"
                defaultValue={card?.closingDay}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="dueDay">Dia do vencimento</Label>
              <Input
                id="dueDay"
                name="dueDay"
                type="number"
                inputMode="numeric"
                min="1"
                max="31"
                defaultValue={card?.dueDay}
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
              {isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
