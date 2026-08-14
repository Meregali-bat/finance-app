"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
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
  dayParam,
  nextRangeParams,
  previousRangeParams,
  rangeHref,
  type RangeMode,
  type ResolvedRange,
} from "@/lib/date-range";
import { cn } from "@/lib/utils";

const MODES: { value: RangeMode; label: string }[] = [
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mês" },
  { value: "custom", label: "Personalizado" },
];

/**
 * A barra de período: setas para os vizinhos e o rótulo como gatilho do
 * seletor. O período mora inteiro na URL, então navegar é só trocar de link —
 * o botão voltar e um link compartilhado continuam funcionando.
 */
export function PeriodPicker({ range }: { range: ResolvedRange }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<RangeMode>(range.mode);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    // Cancelar não pode deixar um modo escolhido pela metade para a próxima
    // abertura: o seletor volta a descrever o período que está na tela.
    if (!next) setMode(range.mode);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const from = form.get("from");
    const to = form.get("to");

    router.push(
      rangeHref(
        mode === "custom"
          ? { range: "custom", from: String(from), to: String(to) }
          // Semana e mês sem âncora: escolher o modo leva ao período corrente,
          // e as setas é que andam a partir dali.
          : { range: mode },
      ),
    );
    handleOpenChange(false);
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-2xl bg-card p-2 shadow-surface ring-1 ring-foreground/10 lg:w-fit lg:gap-6 lg:self-start">
      <Link
        href={rangeHref(previousRangeParams(range))}
        className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Período anterior"
      >
        <ChevronLeft className="size-5" aria-hidden="true" />
      </Link>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger
          render={
            <button
              type="button"
              className="flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 py-1 transition-colors hover:bg-muted"
            />
          }
        >
          {/* `capitalize` maiusculiza toda palavra e viraria "Agosto De 2026". */}
          <span className="truncate font-heading font-medium first-letter:uppercase">
            {range.label}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Período</DialogTitle>
          </DialogHeader>
          {/* Remonta os campos a cada abertura e a cada período: eles são não
              controlados, e trocar o `defaultValue` de um input já montado não
              muda o que está escrito nele. */}
          <form
            key={`${open}-${range.rangeStart.getTime()}`}
            onSubmit={handleSubmit}
            className="flex flex-col gap-4"
          >
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
              {MODES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setMode(option.value)}
                  aria-pressed={mode === option.value}
                  className={cn(
                    "rounded-lg py-2 text-sm font-medium transition-colors duration-150",
                    mode === option.value
                      ? "bg-card text-foreground shadow-surface ring-1 ring-foreground/10"
                      : "text-muted-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {/* Só o personalizado tem datas para escolher. Nos outros modos os
                campos apareciam desabilitados, o que parecia uma data que se
                recusa a mudar — e fora do FormData eles já estavam de qualquer
                jeito.

                Empilhados até `sm`: lado a lado num celular sobra pouco mais de
                170px por campo, e o `<input type="date">` do iOS desenha a data
                nativa sem truncar, então ela vazava por cima do campo vizinho. */}
            {mode === "custom" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="from">De</Label>
                  <Input
                    id="from"
                    name="from"
                    type="date"
                    required
                    defaultValue={dayParam(range.rangeStart)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="to">Até</Label>
                  <Input
                    id="to"
                    name="to"
                    type="date"
                    required
                    // O fim é exclusivo: o campo mostra o último dia de dentro.
                    defaultValue={dayParam(new Date(range.rangeEnd.getTime() - 1))}
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="submit">Aplicar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Link
        href={rangeHref(nextRangeParams(range))}
        className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Próximo período"
      >
        <ChevronRight className="size-5" aria-hidden="true" />
      </Link>
    </div>
  );
}
