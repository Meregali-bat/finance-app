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
import { CurrencyInput } from "@/components/currency-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createCreditCard, updateCreditCard } from "@/lib/actions/card";
import { CARD_BANKS, cardGradient, cardStyleOption } from "@/lib/card-look";
import { cn } from "@/lib/utils";
import { iconButton } from "@/components/ui/icon-button";

type CardValues = {
  id: string;
  name: string;
  closingDay: number;
  dueDay: number;
  creditLimit?: number;
  style?: string | null;
};

export function CardFormDialog({ card }: { card?: CardValues }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!card;
  const initial = cardStyleOption(card?.style);
  const [custom, setCustom] = useState(!!initial);
  const [bank, setBank] = useState(initial?.bank ?? CARD_BANKS[0].bank);
  const [model, setModel] = useState(initial?.id ?? CARD_BANKS[0].models[0].id);
  const [name, setName] = useState(card?.name ?? "");
  const models = CARD_BANKS.find((b) => b.bank === bank)?.models ?? [];
  const style = custom ? model : "";

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
          <button
            type="button"
            className={
              isEdit
                ? iconButton({ tone: "ghost", size: "sm" })
                : iconButton({ tone: "cta", size: "lg" })
            }
            aria-label={isEdit ? "Editar cartão" : "Novo cartão"}
            title={isEdit ? "Editar cartão" : "Novo cartão"}
          />
        }
      >
        {isEdit ? <Pencil aria-hidden="true" /> : <Plus aria-hidden="true" />}
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
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-3">
            <input type="hidden" name="style" value={style} />
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="card-custom">Personalizar a cor</Label>
              {/* O mesmo interruptor dos Fixos, sem a action: aqui ele só
                  mostra ou esconde os campos. */}
              <button
                id="card-custom"
                type="button"
                role="switch"
                aria-checked={custom}
                onClick={() => setCustom(!custom)}
                className="flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "relative h-5 w-[34px] rounded-full transition-colors duration-200",
                    custom ? "bg-primary" : "bg-secondary",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 left-0.5 size-4 rounded-full transition-[translate,background-color] duration-[280ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]",
                      custom ? "translate-x-3.5 bg-background" : "bg-muted-foreground",
                    )}
                  />
                </span>
              </button>
            </div>
            {custom && (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="card-bank">Banco</Label>
                  <Select
                    value={bank}
                    onValueChange={(value) => {
                      const next = value as string;
                      setBank(next);
                      // Trocar de banco leva ao primeiro cartão dele.
                      const first = CARD_BANKS.find((b) => b.bank === next)?.models[0];
                      if (first) setModel(first.id);
                    }}
                  >
                    <SelectTrigger id="card-bank" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CARD_BANKS.map((b) => (
                        <SelectItem key={b.bank} value={b.bank}>
                          {b.bank}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="card-model">Cartão</Label>
                  <Select value={model} onValueChange={(value) => setModel(value as string)}>
                    <SelectTrigger id="card-model" className="w-full">
                      <SelectValue>
                        {(value: string) => cardStyleOption(value)?.model ?? ""}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            {/* Prévia: o cartão como vai aparecer na lista. */}
            <div
              aria-hidden="true"
              className="flex h-[88px] flex-col justify-between rounded-[18px] p-4 text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.09)] transition-[background] duration-300"
              style={{ background: cardGradient(card?.id ?? "novo", style) }}
            >
              <span className="truncate font-heading text-lg leading-tight font-bold tracking-[-0.03em]">
                {name || "Seu cartão"}
              </span>
              <span className="text-xs text-white/70">
                {custom ? cardStyleOption(model)?.model : "Cor automática"}
              </span>
            </div>
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
          <div className="flex flex-col gap-2">
            <Label htmlFor="creditLimit">Limite (opcional)</Label>
            {/* Sem `required`: vazio manda "", que a action lê como "sem limite"
                em vez de limite zero. */}
            <CurrencyInput id="creditLimit" name="creditLimit" defaultValue={card?.creditLimit} />
            <p className="text-xs text-muted-foreground">
              Informe para acompanhar quanto do cartão já está comprometido.
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
