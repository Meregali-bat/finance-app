"use client";

import { useState, useTransition } from "react";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { CurrencyInput } from "@/components/currency-input";
import { depositToJar, withdrawFromJar } from "@/lib/actions/jar";
import { iconButton } from "@/components/ui/icon-button";
import { errorMessage } from "@/lib/error-message";
import {
  JarYieldPreview,
  suggestedUntil,
  UntilChips,
  type YieldContext,
} from "@/components/jar-yield-preview";

/**
 * Guardar e resgatar são o mesmo formulário com a direção trocada: o resgate
 * vira um depósito negativo no servidor.
 */
export function JarDepositDialog({
  jarId,
  jarName,
  mode = "deposit",
  onDone,
  disabled,
  cdiPercent = null,
  yieldContext = null,
}: {
  jarId: string;
  jarName: string;
  mode?: "deposit" | "withdraw";
  /** Quanto do CDI a caixinha rende: com ele, guardar mostra o rendimento até o resgate. */
  cdiPercent?: number | null;
  yieldContext?: YieldContext | null;
  /** Depois de salvar, com o id do movimento e o valor — para o toast. */
  onDone?: (result: { depositId: string; amount: number }) => void;
  disabled?: boolean;
}) {
  const withdraw = mode === "withdraw";
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(0);
  // O resgate previsto começa no próximo pagamento: é o dia em que o dinheiro
  // costuma voltar a fazer falta.
  const [until, setUntil] = useState(yieldContext ? suggestedUntil(yieldContext) : "");
  // O dia em que o dinheiro entrou (ou saiu) de verdade — pode ter sido antes
  // de lançar aqui, e é dele que o rendimento e o IOF contam.
  const [date, setDate] = useState(yieldContext?.today ?? "");
  // Com data para tirar, o dinheiro está estacionado, e não guardado: volta
  // para a Previsão no dia e não conta nas fatias.
  const [planned, setPlanned] = useState(false);
  const canPlan = !withdraw && yieldContext != null;
  const showYield = !withdraw && cdiPercent != null && yieldContext != null;
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await (withdraw ? withdrawFromJar : depositToJar)(jarId, formData);
        setOpen(false);
        onDone?.({ depositId: result.depositId, amount: Number(formData.get("amount")) });
      } catch (e) {
        setError(errorMessage(e, "Erro ao salvar"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        disabled={disabled}
        render={
          <button
            type="button"
            className={iconButton({
              tone: withdraw ? "outline" : "solid",
              size: "lg",
              // Com o nome escrito: uma seta para baixo e outra para cima não
              // dizem qual guarda e qual tira. No celular fica só o nome.
              className:
                "h-11 w-auto min-w-0 flex-1 gap-1.5 rounded-[14px] px-2 text-[13px] font-semibold [&_svg]:size-4",
            })}
          />
        }
      >
        {withdraw ? (
          <ArrowUpFromLine aria-hidden="true" className="max-sm:hidden" />
        ) : (
          <ArrowDownToLine aria-hidden="true" className="max-sm:hidden" />
        )}
        {withdraw ? "Resgatar" : "Guardar"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {withdraw ? "Resgatar de" : "Guardar em"} &ldquo;{jarName}&rdquo;
          </DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex min-w-0 flex-col gap-2">
              <Label htmlFor="amount">Valor</Label>
              <CurrencyInput id="amount" name="amount" required onValueChange={setAmount} />
            </div>
            {yieldContext && (
              <div className="flex min-w-0 flex-col gap-2">
                <Label htmlFor="date">{withdraw ? "Quando saiu" : "Quando entrou"}</Label>
                <Input
                  id="date"
                  name="date"
                  type="date"
                  value={date}
                  max={yieldContext.today}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            )}
          </div>
          {canPlan && (
            <div className="flex flex-col gap-3 rounded-2xl bg-muted/60 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Label htmlFor="planned-switch">Vou tirar numa data</Label>
                  <p className="text-xs text-muted-foreground">
                    Volta para a Previsão nesse dia e não conta como guardado nas fatias.
                  </p>
                </div>
                <Switch id="planned-switch" checked={planned} onCheckedChange={setPlanned} />
              </div>
              {(planned || showYield) && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="until">{planned ? "Tirar em" : "Simular até"}</Label>
                  <Input
                    id="until"
                    // Só vai para o servidor quando é um resgate previsto; sem
                    // ele, a data serve só à simulação do rendimento.
                    name={planned ? "plannedWithdrawalAt" : undefined}
                    type="date"
                    value={until}
                    min={yieldContext.today}
                    required={planned}
                    onChange={(e) => setUntil(e.target.value)}
                  />
                  <UntilChips context={yieldContext} value={until} onChange={setUntil} />
                </div>
              )}
              {showYield && (
                <JarYieldPreview
                  lots={[{ from: date || yieldContext.today, amount }]}
                  cdiAnnualPercent={yieldContext.cdiAnnualPercent}
                  cdiPercent={cdiPercent}
                  to={until || yieldContext.today}
                />
              )}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="note">Nota (opcional)</Label>
            <Input
              id="note"
              name="note"
              placeholder={withdraw ? "Conserto do carro" : "Sobra de julho"}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? withdraw
                  ? "Resgatando..."
                  : "Guardando..."
                : withdraw
                  ? "Resgatar"
                  : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
