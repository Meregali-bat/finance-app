"use client";

import { useState, useTransition } from "react";
import { Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CurrencyInput } from "@/components/currency-input";
import { PurchaseVerdict } from "@/components/purchase-verdict";
import { createCardPurchase } from "@/lib/actions/card";
import {
  runPurchaseSimulation,
  setCommitmentLimit,
  type PurchaseSimulationView,
} from "@/lib/actions/purchase-simulation";
import { MAX_SIMULATION_INSTALLMENTS } from "@/lib/purchase-simulation";
import { todayInputValue } from "@/lib/format";

const NONE = "__none__";

interface Option {
  id: string;
  name: string;
}

export function PurchaseSimulationDialog({
  cards,
  categories = [],
}: {
  cards: Option[];
  categories?: Option[];
}) {
  const [open, setOpen] = useState(false);
  const [cardId, setCardId] = useState(cards[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState<string>(NONE);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  /**
   * O FormData da simulação fica guardado porque é ele que o botão "Comprei"
   * entrega a `createCardPurchase` — os dois schemas têm os mesmos campos, e é
   * isso que faz a compra nascer sem ninguém redigitar nada.
   */
  const [submitted, setSubmitted] = useState<FormData | null>(null);
  const [result, setResult] = useState<PurchaseSimulationView | null>(null);
  const [bought, setBought] = useState(false);
  const [editingLimit, setEditingLimit] = useState(false);

  function reset() {
    setResult(null);
    setSubmitted(null);
    setBought(false);
    setEditingLimit(false);
    setError(null);
  }

  function run(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        setResult(await runPurchaseSimulation(formData));
        setSubmitted(formData);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não deu para simular");
      }
    });
  }

  function handleRetryWithInstallments(installments: number) {
    if (!submitted) return;
    const next = new FormData();
    submitted.forEach((value, key) => next.append(key, value));
    next.set("installments", String(installments));
    run(next);
  }

  function handleBuy() {
    if (!submitted || bought) return;
    setError(null);
    startTransition(async () => {
      try {
        await createCardPurchase(String(submitted.get("cardId")), submitted);
        // Trancado antes de fechar: `isPending` sozinho não cobre um clique
        // duplo rápido, e o segundo criaria uma segunda compra igual.
        setBought(true);
        setOpen(false);
        reset();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar a compra");
      }
    });
  }

  function handleLimit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await setCommitmentLimit(formData);
        setEditingLimit(false);
        if (submitted) run(submitted);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar o teto");
      }
    });
  }

  const amount = Number(submitted?.get("amount") ?? 0);
  const installments = Number(submitted?.get("installments") ?? 1);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button variant="outline" className="gap-2" />}>
        <Scale className="size-4" /> Posso comprar?
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{result ? "O veredito" : "Posso comprar isso?"}</DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="flex flex-col gap-4">
            <PurchaseVerdict
              result={result}
              amount={amount}
              installments={installments}
              onRetryWithInstallments={handleRetryWithInstallments}
            />

            {editingLimit ? (
              <form action={handleLimit} className="flex items-end gap-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="commitmentLimitPercent">Teto de comprometimento (%)</Label>
                  <Input
                    id="commitmentLimitPercent"
                    name="commitmentLimitPercent"
                    type="number"
                    inputMode="numeric"
                    min="10"
                    max="100"
                    defaultValue={result.commitmentLimitPercent}
                    required
                  />
                </div>
                <Button type="submit" variant="outline" disabled={isPending}>
                  {isPending ? "Salvando..." : "Salvar"}
                </Button>
              </form>
            ) : (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="self-start px-0"
                onClick={() => setEditingLimit(true)}
              >
                Ajustar o teto de {result.commitmentLimitPercent}%
              </Button>
            )}

            {error && (
              <p role="alert" className="text-sm text-negative">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={reset} disabled={isPending}>
                Simular outra
              </Button>
              <Button type="button" onClick={handleBuy} disabled={isPending || bought}>
                {isPending ? "Salvando..." : "Comprei"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form action={run} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="description">O que é</Label>
              <Input id="description" name="description" placeholder="Fone novo" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="amount">Valor total</Label>
                <CurrencyInput id="amount" name="amount" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="installments">Parcelas</Label>
                <Input
                  id="installments"
                  name="installments"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max={MAX_SIMULATION_INSTALLMENTS}
                  defaultValue={1}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="cardId">Cartão</Label>
                <input type="hidden" name="cardId" value={cardId} />
                <Select value={cardId} onValueChange={(v) => setCardId(v as string)}>
                  <SelectTrigger id="cardId" className="w-full">
                    <SelectValue>
                      {(value: string) => cards.find((c) => c.id === value)?.name}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {cards.map((card) => (
                      <SelectItem key={card.id} value={card.id}>
                        {card.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="date">Quando</Label>
                <Input
                  id="date"
                  name="date"
                  type="date"
                  defaultValue={todayInputValue()}
                  required
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              O fechamento do cartão decide em qual fatura a primeira parcela cai.
            </p>
            {categories.length > 0 && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="categoryId">Categoria</Label>
                {/*
                  A categoria não entra em conta nenhuma — `period.ts` não sabe
                  o que é categoria. Ela viaja junto só para a compra nascer
                  categorizada se o botão "Comprei" for usado.
                */}
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
              <Button type="submit" disabled={isPending}>
                {isPending ? "Simulando..." : "Ver se cabe"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
