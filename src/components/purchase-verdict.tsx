"use client";

import { AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SectionLabel } from "@/components/page-header";
import { formatCurrency, formatDate, formatDateLong, installmentLabel } from "@/lib/format";
import type {
  PeriodImpactView,
  PurchaseSimulationView,
} from "@/lib/actions/purchase-simulation";

function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/** "05 set → 05 out", o intervalo que nomeia um ciclo. */
function rangeLabel(start: string, end: string): string {
  return `${formatDate(new Date(start))} → ${formatDate(new Date(end))}`;
}

/**
 * Por que a compra foi reprovada, em uma frase por motivo.
 *
 * Um ciclo que já estava reprovado antes da compra ganha frase própria: dizer
 * "esta compra estoura o seu mês" quando o mês já estava estourado manda o
 * usuário consertar a coisa errada — e a compra viraria bode expiatório de um
 * problema que ela não criou.
 */
function reasons(result: PurchaseSimulationView): string[] {
  const worst =
    result.periods.find((p) => p.offset === result.worstOffset) ?? result.periods[0] ?? null;
  const lines: string[] = [];

  if (result.blockers.includes("noIncome")) {
    lines.push(
      "Você ainda não tem renda cadastrada, então não há ciclo nenhum para projetar esta compra.",
    );
    return lines;
  }

  if (result.alreadyFailing) {
    lines.push(
      `O ciclo de ${worst ? rangeLabel(worst.periodStart, worst.periodEnd) : "um dos meses"} já fecha apertado mesmo sem esta compra.`,
    );
  }

  if (result.blockers.includes("negativeBalance") && worst) {
    lines.push(
      `No ciclo de ${rangeLabel(worst.periodStart, worst.periodEnd)} faltariam ${formatCurrency(Math.abs(worst.balanceAfter))}.`,
    );
  }

  if (result.blockers.includes("overCommitment") && worst?.commitmentAfter != null) {
    lines.push(
      `O comprometimento iria a ${formatPercent(worst.commitmentAfter)} da renda, acima do seu teto de ${result.commitmentLimitPercent}%.`,
    );
  }

  return lines;
}

function PeriodRow({ period }: { period: PeriodImpactView }) {
  const worse = period.balanceAfter < period.balanceBefore;

  return (
    <li className="flex flex-col gap-1 border-l-2 border-border/60 py-1 pl-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm text-muted-foreground">
          {rangeLabel(period.periodStart, period.periodEnd)}
          {period.installmentCount > 1 && ` · ${period.installmentCount} parcelas`}
        </span>
        <span className="flex items-center gap-1.5 text-sm tabular-nums">
          <span className="text-muted-foreground">{formatCurrency(period.balanceBefore)}</span>
          <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
          <span
            className={period.balanceAfter < 0 ? "font-medium text-negative" : "font-medium"}
          >
            {formatCurrency(period.balanceAfter)}
          </span>
        </span>
      </div>
      {/*
        A sobra por dia vem junto porque a régua aprova um ciclo que fecha em
        R$ 0,01, e a sobra do período não reserva nada para mercado ou
        transporte. Ver o diário cair de R$ 160 para R$ 6 diz o que um SIM
        tecnicamente correto esconderia.
      */}
      {worse && (
        <span className="text-xs text-muted-foreground tabular-nums">
          Por dia: {formatCurrency(period.dailyBefore)} → {formatCurrency(period.dailyAfter)}
          {period.commitmentBefore != null &&
            period.commitmentAfter != null &&
            ` · comprometido: ${formatPercent(period.commitmentBefore)} → ${formatPercent(period.commitmentAfter)}`}
        </span>
      )}
    </li>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function PurchaseVerdict({
  result,
  amount,
  installments,
  onRetryWithInstallments,
}: {
  result: PurchaseSimulationView;
  amount: number;
  installments: number;
  onRetryWithInstallments: (installments: number) => void;
}) {
  const label = installmentLabel(amount, installments);
  const lines = reasons(result);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <p
          className={`font-heading text-[2.25rem] leading-[1.05] font-bold tracking-[-0.03em] ${
            result.approved ? "text-primary" : "text-negative"
          }`}
        >
          {result.approved ? "Pode comprar" : "Melhor não"}
        </p>
        <p className="text-sm text-muted-foreground">
          {label ?? formatCurrency(amount)}
          {result.firstDueDate &&
            ` · 1ª parcela na fatura de ${formatDateLong(new Date(result.firstDueDate))}`}
        </p>
      </div>

      {lines.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {lines.map((line) => (
            <li key={line} className="text-sm">
              {line}
            </li>
          ))}
        </ul>
      )}

      {!result.approved && (result.minInstallments !== null || result.maxAffordableAmount > 0) && (
        <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
          <SectionLabel>O que caberia</SectionLabel>
          {result.minInstallments !== null && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                Em {result.minInstallments}x, este mesmo valor passaria.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onRetryWithInstallments(result.minInstallments!)}
              >
                Simular em {result.minInstallments}x
              </Button>
            </div>
          )}
          {result.maxAffordableAmount > 0 && (
            <p className="text-sm text-muted-foreground">
              Em {installments}x, caberiam{" "}
              <span className="text-foreground tabular-nums">
                {formatCurrency(result.maxAffordableAmount)}
              </span>
              {installmentLabel(result.maxAffordableAmount, installments) &&
                ` — ${installmentLabel(result.maxAffordableAmount, installments)}`}
              .
            </p>
          )}
        </div>
      )}

      {result.periods.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel>Ciclo a ciclo</SectionLabel>
          <ul className="flex flex-col gap-2">
            {result.periods.map((period) => (
              <PeriodRow key={period.offset} period={period} />
            ))}
          </ul>
        </div>
      )}

      {result.limitUsage && (
        <div className="flex flex-col gap-2">
          <SectionLabel>Limite do cartão</SectionLabel>
          <Progress
            value={result.limitUsage.percentUsed}
            indicatorClassName={result.limitUsage.percentUsed >= 100 ? "bg-negative" : undefined}
          />
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatCurrency(result.limitUsage.available)} disponíveis de{" "}
            {formatCurrency(result.limitUsage.limit)}
            {/*
              O limite é informativo e não reprova: as duas réguas são sobre o
              orçamento, e "o banco recusaria" é outra pergunta. Mas se a compra
              não cabe no limite, ela simplesmente não acontece — daí o aviso.
            */}
            {result.limitUsage.available < amount && " · esta compra não caberia no limite"}
          </p>
        </div>
      )}

      {result.unevaluatedAmount > 0 && (
        <Warning>
          {formatCurrency(result.unevaluatedAmount)} desta compra ficaram fora da análise
          {result.truncatedAfter &&
            `: as parcelas depois de ${formatDateLong(new Date(result.truncatedAfter))} vão além do que dá para projetar`}
          . O veredito acima não cobre a compra inteira.
        </Warning>
      )}

      {result.usingDefaultLimit && (
        <p className="text-xs text-muted-foreground">
          Usando o teto padrão de {result.commitmentLimitPercent}% da renda.
        </p>
      )}
    </div>
  );
}
