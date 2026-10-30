"use client";

import { unwrap } from "@/lib/action-result";
import { useState, useTransition } from "react";
import { TrendingUp } from "lucide-react";
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
import {
  dayFromKey,
  JarYieldPreview,
  shortDay,
  suggestedUntil,
  UntilChips,
  type LotView,
  type YieldContext,
} from "@/components/jar-yield-preview";
import { formatCurrency } from "@/lib/format";
import { setJarYield } from "@/lib/actions/jar";
import { errorMessage } from "@/lib/error-message";

function numberOf(text: string): number {
  const n = Number(text.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Quanto a caixinha rende: a porcentagem do CDI (o que se salva) e uma
 * simulação com o saldo dela, ou outro valor, até a data do resgate. O CDI
 * vem do Banco Central e dá para corrigir aqui, só para a conta.
 */
export function JarYieldDialog({
  jarId,
  jarName,
  lots,
  cdiPercent,
  context,
  leaving = [],
  onSaved,
}: {
  jarId: string;
  jarName: string;
  /** O saldo pelas entradas que o formam, cada uma com a sua data. */
  lots: LotView[];
  cdiPercent: number | null;
  context: YieldContext;
  /** O que já tem data de volta: sai antes, e a simulação diz isso. */
  leaving?: { amount: number; date: string }[];
  /** Salvo: o aviso é de quem chama. */
  onSaved?: (percent: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [percentText, setPercentText] = useState(String(cdiPercent ?? 100));
  const [cdiText, setCdiText] = useState(
    context.cdiAnnualPercent.toLocaleString("pt-BR", { maximumFractionDigits: 2 }),
  );
  const [until, setUntil] = useState(suggestedUntil(context));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save(formData: FormData) {
    setError(null);
    start(async () => {
      try {
        unwrap(await setJarYield(jarId, formData));
        setOpen(false);
        const typed = String(formData.get("cdiPercent") ?? "").replace(",", ".").trim();
        onSaved?.(typed ? Number(typed) : null);
      } catch (e) {
        setError(errorMessage(e, "Não deu para salvar."));
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
        <TrendingUp className="size-3.5 text-positive" aria-hidden="true" />
        {cdiPercent != null
          ? `Rende ${cdiPercent.toLocaleString("pt-BR")}% do CDI`
          : "Quanto rende?"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rendimento de &ldquo;{jarName}&rdquo;</DialogTitle>
          <DialogDescription>
            Quanto o dinheiro guardado aqui devolve no dia do resgate, já sem IOF e imposto de
            renda.
          </DialogDescription>
        </DialogHeader>
        <form action={save} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="cdiPercent">Rende do CDI</Label>
              <div className="relative">
                <Input
                  id="cdiPercent"
                  name="cdiPercent"
                  inputMode="decimal"
                  value={percentText}
                  onChange={(e) => setPercentText(e.target.value)}
                  className="pr-8 tabular-nums"
                />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground">
                  %
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="cdiAnnual">CDI ao ano (só na simulação)</Label>
              <div className="relative">
                <Input
                  id="cdiAnnual"
                  inputMode="decimal"
                  value={cdiText}
                  onChange={(e) => setCdiText(e.target.value)}
                  className="pr-8 tabular-nums"
                />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground">
                  %
                </span>
              </div>
            </div>
          </div>
          <p className="-mt-2 text-[12.5px] text-muted-foreground">
            {context.cdiSource === "bcb"
              ? `CDI do Banco Central em ${context.cdiDate}.`
              : "Não deu para buscar o CDI de hoje: confira o valor no app do seu banco."}{" "}
            A Caixinha do Nubank e o RDB costumam render 100%.
          </p>

          <div className="flex flex-col gap-2">
            <Label htmlFor="yieldUntil">Resgatar em</Label>
            <Input
              id="yieldUntil"
              type="date"
              value={until}
              min={context.today}
              onChange={(e) => setUntil(e.target.value)}
            />
            <UntilChips context={context} value={until} onChange={setUntil} />
          </div>

          {lots.length > 0 && (
            <p className="-mt-1 text-[12.5px] text-muted-foreground">
              {leaving.length > 0 ? "O que fica, pelas datas em que entrou: " : "O saldo pelas datas em que entrou: "}
              {lots
                .map(
                  (lot) => `${formatCurrency(lot.amount)} desde ${shortDay(dayFromKey(lot.from))}`,
                )
                .join(" · ")}
              . Para uma entrada de outro dia, use o Guardar e informe quando entrou.
            </p>
          )}
          {/* O que tem data de volta sai antes do resgate simulado: somá-lo
              mostrava um rendimento que ele não vai ter. */}
          {leaving.length > 0 && (
            <p className="-mt-1 text-[12.5px] text-muted-foreground tabular-nums">
              Fora da simulação:{" "}
              {leaving
                .map((r) => `${formatCurrency(r.amount)} sai em ${shortDay(dayFromKey(r.date))}`)
                .join(" · ")}
              .
            </p>
          )}

          {lots.length > 0 ? (
            <JarYieldPreview
              lots={lots}
              cdiAnnualPercent={numberOf(cdiText)}
              cdiPercent={numberOf(percentText)}
              to={until || context.today}
            />
          ) : (
            <p className="rounded-[14px] bg-muted/50 px-3.5 py-3 text-[13px] text-muted-foreground">
              A caixinha está vazia. No Guardar, depois de salvar a porcentagem, aparece quanto cada
              valor rende até o resgate.
            </p>
          )}
          <p className="-mt-2 text-[12.5px] text-muted-foreground">
            O que está lá há mais de 30 dias já não paga IOF.
          </p>

          {error && (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando..." : `Salvar ${numberOf(percentText) || 100}% do CDI`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
