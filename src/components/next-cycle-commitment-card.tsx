import Link from "next/link";
import { ChevronRight, CreditCard, TriangleAlert } from "lucide-react";
import { homeCard } from "@/components/home-card";
import { formatCurrency } from "@/lib/format";
import type { NextCycleCommitment } from "@/lib/next-cycle-commitment";
import { cn } from "@/lib/utils";

const percent = (share: number) => `${Math.round(share * 100)}%`;

/**
 * Quanto do próximo ciclo já chega comprometido, com as faturas do cartão em
 * destaque. O cartão adia a saída, e o mês seguinte chega tomado sem ninguém
 * avisar: aqui avisa enquanto ainda dá para frear. Uma linha que se lê de
 * relance (o total e o teto), uma barra com as duas partes e a marca do teto,
 * e a conta embaixo. Só aparece a partir de 30% da renda em faturas.
 */
export function NextCycleCommitmentCard({
  commitment,
  limitPercent,
  startLabel,
  reservedNow,
}: {
  commitment: NextCycleCommitment;
  limitPercent: number;
  /** "15 de nov.": o dia em que o próximo ciclo começa. Pela data, e não pelo
   * mês: em 1º de novembro, "novembro" se lia como o ciclo de agora. */
  startLabel: string;
  /** O número de hoje já guarda dinheiro para um ciclo à frente que vai faltar. */
  reservedNow: boolean;
}) {
  const alert = commitment.tone === "alert";
  const fixedShare = commitment.income > 0 ? commitment.fixed / commitment.income : 0;
  return (
    <section
      aria-label={`Comprometido no ciclo de ${startLabel}`}
      // Sem borda vermelha: o alerta mora no ícone e na porcentagem. O card
      // inteiro em vermelho logo abaixo do número do dia parecia dizer que o
      // problema é hoje, e o texto diz o contrário.
      className={homeCard("flex flex-col gap-3")}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "flex size-[38px] shrink-0 items-center justify-center rounded-xl",
            alert ? "bg-negative/12 text-negative" : "bg-muted text-primary",
          )}
        >
          {/* No alerta, o ícone também muda: a cor sozinha não avisa todo mundo. */}
          {alert ? <TriangleAlert className="size-[18px]" /> : <CreditCard className="size-[18px]" />}
        </span>
        <p className="min-w-0 text-[15px] leading-snug font-semibold text-pretty tabular-nums">
          Do que entra em {startLabel},{" "}
          <span className={alert ? "text-negative" : undefined}>
            {percent(commitment.totalShare)} já está comprometido
          </span>
          {commitment.overLimit && (
            <span className="font-medium text-muted-foreground">
              , acima dos {limitPercent}% que você definiu
            </span>
          )}
        </p>
      </div>

      {/* As faturas na cor do aviso, as contas fixas atrás, e um traço no
          teto: dá para ver de longe quanto é cartão e quanto passou. */}
      <div className="flex flex-col gap-1.5">
        <div className="relative h-2 rounded-full bg-(--track)" aria-hidden="true">
          <div className="flex h-full overflow-hidden rounded-full">
            <div
              className={alert ? "bg-negative" : "bg-primary"}
              style={{ width: `${Math.min(100, commitment.cardShare * 100)}%` }}
            />
            <div
              className="bg-foreground/40"
              style={{ width: `${Math.max(0, Math.min(100 - commitment.cardShare * 100, fixedShare * 100))}%` }}
            />
          </div>
          <span
            className="absolute -top-1 h-4 w-0.5 rounded-full bg-foreground/70"
            style={{ left: `calc(${Math.min(100, limitPercent)}% - 1px)` }}
          />
        </div>
        <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px] text-muted-foreground tabular-nums">
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn("size-2 rounded-full", alert ? "bg-negative" : "bg-primary")}
            />
            Faturas {formatCurrency(commitment.cardBills)} ({percent(commitment.cardShare)})
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2 rounded-full bg-foreground/40" />
            Contas fixas {formatCurrency(commitment.fixed)} ({percent(fixedShare)})
          </li>
        </ul>
      </div>

      {/* O que isso muda para quem olha o número do dia, e para onde ir. */}
      <div className="flex flex-col gap-0.5">
        <p className="text-[13px] text-pretty text-muted-foreground">
          {reservedNow
            ? `O número de hoje já guarda uma parte para esse ciclo. Cada compra no cartão agora aumenta o que vence lá.`
            : `O número de hoje não muda: é o ciclo de ${startLabel} que chega apertado, e cada compra no cartão agora aumenta o que vence lá.`}
        </p>
        <Link
          href="/previsao?p=1"
          className="-my-1 flex min-h-11 w-fit items-center gap-0.5 text-[13px] font-medium text-primary underline-offset-4 hover:underline"
        >
          Ver esse ciclo na Previsão
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
