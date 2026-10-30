"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link, { useLinkStatus } from "next/link";
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
import { rangeHref, type RangeMode, type ResolvedRange } from "@/lib/date-range";
import { cn } from "@/lib/utils";

const MODES: { value: RangeMode; label: string }[] = [
  { value: "hoje", label: "Hoje" },
  { value: "semana", label: "Semana" },
  { value: "ciclo", label: "Ciclo" },
  { value: "mes", label: "Mês" },
  { value: "custom", label: "Personalizado" },
];

/**
 * As setas são o alvo de toque mais estreito da tela, então valem 44px (o
 * mínimo confortável para o polegar) em vez dos 40 do ícone, e reagem ao
 * toque: com só `hover:`, um toque no celular não deixa rastro nenhum.
 *
 * A reação é de cor, nunca de escala. Encolher um alvo desse tamanho tira a
 * borda de baixo do dedo entre o `touchstart` e o `touchend`, e o iOS não
 * dispara o clique — o botão pisca e não navega.
 */
const ARROW_CLASS =
  "flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-[14px] text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground active:bg-muted active:text-foreground";

/**
 * A barra de período: setas para os vizinhos e o rótulo como gatilho do
 * seletor. O período mora inteiro na URL, então navegar é só trocar de link —
 * o botão voltar e um link compartilhado continuam funcionando.
 */
export function PeriodPicker({
  range,
  cycles = false,
}: {
  range: ResolvedRange;
  /** Há renda que marca ciclo: o modo "Ciclo" (de um pagamento ao outro) aparece. */
  cycles?: boolean;
}) {
  const modes = MODES.filter((m) => cycles || m.value !== "ciclo");
  const router = useRouter();
  // O período novo leva um tempo para chegar: o rótulo esmaece até lá, para o
  // toque em "Aplicar" não parecer ignorado.
  const [navigating, startNavigation] = useTransition();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<RangeMode>(range.mode);

  // Caminho na frente da query: um href só com `?...` depende de o navegador e
  // o roteador resolverem contra a URL atual, e é uma variável a menos numa
  // navegação que já se comporta diferente no celular.
  const hrefFor = (params: Parameters<typeof rangeHref>[0]) => `${pathname}${rangeHref(params)}`;

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

    startNavigation(() => router.push(
      hrefFor(
        mode === "custom"
          ? { range: "custom", from: String(from), to: String(to) }
          // Semana, ciclo e mês sem âncora: escolher o modo leva ao período corrente,
          // e as setas é que andam a partir dali.
          : { range: mode },
      ),
    ));
    handleOpenChange(false);
  }

  return (
    <div className="rise-in flex items-center justify-between gap-2 rounded-[18px] bg-card p-1.5 shadow-[inset_0_0_0_1px_var(--hairline)] lg:w-fit lg:min-w-[24rem] lg:self-start">
      <Link
        href={hrefFor(range.previous)}
        className={ARROW_CLASS}
        aria-label="Período anterior"
      >
        <PendingIcon icon={ChevronLeft} />
      </Link>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger
          render={
            <button
              type="button"
              className="flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-[14px] px-3 transition-colors hover:bg-muted"
            />
          }
        >
          {/* `capitalize` maiusculiza toda palavra e viraria "Agosto De 2026". */}
          <span
            className={cn(
              "truncate font-heading text-base font-semibold tracking-[-0.01em] transition-opacity first-letter:uppercase",
              navigating && "animate-pulse opacity-60",
            )}
          >
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
            {/* 2×2 no celular: em quatro colunas sobram ~80px por botão e
                "Personalizado" trunca. Com o ciclo, 3 + 2, e o último ocupa
                o espaço que sobra na segunda linha. */}
            <div
              className={cn(
                "grid gap-1 rounded-xl bg-muted p-1",
                modes.length === 5
                  ? "grid-cols-3 sm:grid-cols-5 [&>:last-child]:col-span-2 sm:[&>:last-child]:col-span-1"
                  : "grid-cols-2 sm:grid-cols-4",
              )}
            >
              {modes.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setMode(option.value)}
                  aria-pressed={mode === option.value}
                  className={cn(
                    "rounded-lg py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
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
                    defaultValue={range.firstDay}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="to">Até</Label>
                  <Input
                    id="to"
                    name="to"
                    type="date"
                    required
                    defaultValue={range.lastDay}
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
        href={hrefFor(range.next)}
        className={ARROW_CLASS}
        aria-label="Próximo período"
      >
        <PendingIcon icon={ChevronRight} />
      </Link>
    </div>
  );
}

/** A seta, pulsando enquanto o período que ela pediu ainda está chegando. */
function PendingIcon({ icon: Icon }: { icon: typeof ChevronLeft }) {
  const { pending } = useLinkStatus();
  return <Icon className={cn("size-5", pending && "animate-pulse")} aria-hidden="true" />;
}
