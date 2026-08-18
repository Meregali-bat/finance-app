"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { CurrencyInput } from "@/components/currency-input";
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
} from "@/lib/actions/transaction";
import {
  createCardPurchase,
  updateCardPurchase,
  deleteCardPurchase,
} from "@/lib/actions/card";
import { todayInputValue } from "@/lib/format";
import type { MovementValues } from "@/lib/history-item";
import { cn } from "@/lib/utils";

const CASH = "__cash__";
const NONE = "__none__";

export function MovementFormDialog({
  cards,
  categories = [],
  movement,
  children,
}: {
  cards: { id: string; name: string }[];
  categories?: { id: string; name: string }[];
  movement?: MovementValues;
  children?: ReactNode;
}) {
  const isEdit = !!movement;
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"expense" | "income">(movement?.type ?? "expense");
  const [cardId, setCardId] = useState<string>(CASH);
  const [categoryId, setCategoryId] = useState<string>(movement?.categoryId ?? NONE);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      // Volta aos valores de origem: cancelar uma edição não pode deixar
      // resíduo para a próxima abertura.
      setKind(movement?.type ?? "expense");
      setCardId(CASH);
      setCategoryId(movement?.categoryId ?? NONE);
      setError(null);
    }
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        if (movement) {
          if (movement.kind === "card") {
            await updateCardPurchase(movement.id, movement.cardId!, formData);
          } else {
            formData.set("type", kind);
            await updateTransaction(movement.id, formData);
          }
        } else if (kind === "expense" && cardId !== CASH) {
          await createCardPurchase(cardId, formData);
        } else {
          formData.set("type", kind);
          await createTransaction(formData);
        }
        handleOpenChange(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar");
      }
    });
  }

  function handleDelete() {
    if (!movement) return;
    startTransition(async () => {
      try {
        if (movement.kind === "card") {
          await deleteCardPurchase(movement.id, movement.cardId!);
        } else {
          await deleteTransaction(movement.id);
        }
        setConfirmDelete(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao excluir");
      }
    });
  }

  const cardName = movement?.cardId
    ? (cards.find((c) => c.id === movement.cardId)?.name ?? "Cartão")
    : null;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger
          render={
            isEdit ? (
              <button type="button" className="block w-full text-left" />
            ) : (
              // Botão flutuante circular no celular; no desktop ele entra no
              // fluxo do cabeçalho e ganha rótulo, porque um círculo solto no
              // canto da tela larga fica desligado do conteúdo.
              <Button
                size="lg"
                className="size-14 rounded-full p-0 shadow-float ring-1 ring-primary/30 active:scale-90 lg:size-auto lg:h-10 lg:w-auto lg:gap-2 lg:rounded-xl lg:px-4"
              />
            )
          }
        >
          {isEdit ? (
            children
          ) : (
            <>
              <Plus className="size-6 lg:size-4" />
              <span className="sr-only lg:not-sr-only">Nova movimentação</span>
            </>
          )}
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Editar movimentação" : "Nova movimentação"}</DialogTitle>
          </DialogHeader>
          {/* Remonta o formulário a cada abertura para que os campos não
              controlados voltem aos valores do lançamento. */}
          <form key={String(open)} action={handleSubmit} className="flex flex-col gap-4">
            {(!isEdit || movement?.kind === "transaction") && (
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
                <button
                  type="button"
                  onClick={() => setKind("expense")}
                  className={cn(
                    "rounded-lg py-2 text-sm font-medium transition-colors duration-150",
                    kind === "expense"
                      ? "bg-card text-negative shadow-surface ring-1 ring-foreground/10"
                      : "text-muted-foreground",
                  )}
                >
                  Despesa
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setKind("income");
                    setCardId(CASH);
                  }}
                  className={cn(
                    "rounded-lg py-2 text-sm font-medium transition-colors duration-150",
                    kind === "income"
                      ? "bg-card text-primary shadow-surface ring-1 ring-foreground/10"
                      : "text-muted-foreground",
                  )}
                >
                  Receita
                </button>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="description">Descrição</Label>
              <Input
                id="description"
                name="description"
                placeholder={kind === "expense" ? "Almoço" : "Freela"}
                defaultValue={movement?.description}
                required
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="amount">Valor</Label>
                <CurrencyInput id="amount" name="amount" defaultValue={movement?.amount} required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="date">Data</Label>
                <Input
                  id="date"
                  name="date"
                  type="date"
                  defaultValue={movement?.date ?? todayInputValue()}
                  required
                />
              </div>
            </div>
            {!isEdit && kind === "expense" && cards.length > 0 && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="cardId">Como foi pago</Label>
                <Select value={cardId} onValueChange={(v) => setCardId(v as string)}>
                  <SelectTrigger id="cardId" className="w-full">
                    <SelectValue>
                      {(value: string) =>
                        value === CASH ? "À vista" : cards.find((c) => c.id === value)?.name
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CASH}>À vista</SelectItem>
                    {cards.map((card) => (
                      <SelectItem key={card.id} value={card.id}>
                        {card.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {/* É por aqui que a maioria das compras no cartão entra, então sem
                este campo o fluxo principal não conseguiria lançar um
                parcelado. Só aparece com um cartão escolhido: à vista não
                existe parcela. */}
            {!isEdit && kind === "expense" && cardId !== CASH && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="installments">Parcelas</Label>
                <Input
                  id="installments"
                  name="installments"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="48"
                  defaultValue={1}
                />
                <p className="text-xs text-muted-foreground">
                  O valor acima é o total da compra; ele é dividido nas próximas faturas.
                </p>
              </div>
            )}
            {/* Trocar à vista ↔ cartão mudaria o lançamento de tabela, então na
                edição o meio de pagamento é só informativo. */}
            {isEdit && kind === "expense" && (
              <div className="flex flex-col gap-1">
                <Label>Como foi pago</Label>
                <p className="text-sm text-muted-foreground">
                  {cardName ?? "À vista"}
                  {movement?.installments && movement.installments > 1
                    ? ` · ${movement.installments}x`
                    : ""}{" "}
                  · para trocar, exclua e lance de novo
                </p>
              </div>
            )}
            {categories.length > 0 && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="categoryId">Categoria</Label>
                <input
                  type="hidden"
                  name="categoryId"
                  value={categoryId === NONE ? "" : categoryId}
                />
                <Select value={categoryId} onValueChange={(v) => setCategoryId(v as string)}>
                  <SelectTrigger id="categoryId" className="w-full">
                    <SelectValue>
                      {(value: string) =>
                        value === NONE
                          ? "Sem categoria"
                          : categories.find((c) => c.id === value)?.name
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sem categoria</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-negative">
                {error}
              </p>
            )}
            <DialogFooter>
              {isEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  className="mr-auto gap-2 text-negative"
                  disabled={isPending}
                  onClick={() => {
                    setOpen(false);
                    setConfirmDelete(true);
                  }}
                >
                  <Trash2 className="size-4" />
                  Excluir
                </Button>
              )}
              <Button type="submit" disabled={isPending}>
                {isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {movement && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title="Excluir?"
          description={`Excluir "${movement.description}"?`}
          confirmLabel="Excluir"
          destructive
          isPending={isPending}
          onConfirm={handleDelete}
        />
      )}
    </>
  );
}
