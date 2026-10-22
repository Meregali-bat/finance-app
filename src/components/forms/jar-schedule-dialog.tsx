"use client";

import { useState, useTransition } from "react";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/currency-input";
import {
  JarYieldPreview,
  suggestedUntil,
  UntilChips,
  type LotView,
  type YieldContext,
} from "@/components/jar-yield-preview";
import { scheduleJarWithdrawal } from "@/lib/actions/jar";
import { errorMessage } from "@/lib/error-message";

/** As entradas mais antigas até somar `amount`: é de onde o resgate sai. */
function oldestUpTo(lots: LotView[], amount: number): LotView[] {
  const picked: LotView[] = [];
  let left = amount;
  for (const lot of [...lots].sort((a, b) => a.from.localeCompare(b.from))) {
    if (left <= 0.005) break;
    const take = Math.min(left, lot.amount);
    picked.push({ from: lot.from, amount: take });
    left -= take;
  }
  return picked;
}

/**
 * Dá data de volta para dinheiro que já está na caixinha: o que foi guardado
 * antes, sem data, passa a voltar para a Previsão no dia da conta que ele vai
 * pagar.
 */
export function JarScheduleDialog({
  jarId,
  jarName,
  available,
  lots,
  cdiPercent,
  context,
}: {
  jarId: string;
  jarName: string;
  /** O saldo que ainda não tem data de volta. */
  available: number;
  lots: LotView[];
  cdiPercent: number | null;
  context: YieldContext;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(available);
  const [until, setUntil] = useState(suggestedUntil(context));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save(formData: FormData) {
    setError(null);
    start(async () => {
      try {
        await scheduleJarWithdrawal(jarId, formData);
        setOpen(false);
      } catch (e) {
        setError(errorMessage(e, "Não deu para agendar."));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="-mx-1 -my-2 flex items-center gap-1.5 self-start rounded-lg px-1 py-2 text-[12.5px] font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
          />
        }
      >
        <CalendarClock className="size-3.5 text-primary" aria-hidden="true" />
        Agendar resgate
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tirar de &ldquo;{jarName}&rdquo; numa data</DialogTitle>
          <DialogDescription>
            Para o dinheiro que já está aqui: ele volta para a Previsão no dia, para pagar a conta
            que você escolher.
          </DialogDescription>
        </DialogHeader>
        <form action={save} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="scheduleAmount">Quanto vai tirar</Label>
            <CurrencyInput
              id="scheduleAmount"
              name="amount"
              required
              defaultValue={available > 0 ? available : undefined}
              onValueChange={setAmount}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="scheduleDate">Tirar em</Label>
            <Input
              id="scheduleDate"
              name="date"
              type="date"
              required
              value={until}
              min={context.today}
              onChange={(e) => setUntil(e.target.value)}
            />
            <UntilChips context={context} value={until} onChange={setUntil} />
          </div>
          {cdiPercent != null && amount > 0 && (
            <JarYieldPreview
              lots={oldestUpTo(lots, amount)}
              cdiAnnualPercent={context.cdiAnnualPercent}
              cdiPercent={cdiPercent}
              to={until || context.today}
            />
          )}
          {error && (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Agendando..." : "Agendar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
