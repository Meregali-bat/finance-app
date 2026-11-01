import Link from "next/link";
import { ChevronRight, CreditCard } from "lucide-react";
import { homeCard } from "@/components/home-card";
import { formatCurrency } from "@/lib/format";
import type { NextCycleCommitment } from "@/lib/next-cycle-commitment";
import { cn } from "@/lib/utils";

const percent = (share: number) => `${Math.round(share * 100)}%`;

/**
 * Quanto as faturas do cartão já tomam da renda do próximo ciclo. O cartão
 * adia a saída, e o mês seguinte chega comprometido sem ninguém avisar: aqui
 * avisa enquanto ainda dá para frear. Só aparece a partir de 30%.
 */
export function NextCycleCommitmentCard({
  commitment,
  limitPercent,
  monthLabel,
}: {
  commitment: NextCycleCommitment;
  limitPercent: number;
  /** "dezembro": o mês em que o próximo ciclo começa. */
  monthLabel: string;
}) {
  const alert = commitment.tone === "alert";
  return (
    <section
      aria-label="Faturas no próximo ciclo"
      className={homeCard(
        cn(
          "flex items-start gap-3",
          alert && "shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--negative)_30%,transparent)]",
        ),
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-[38px] shrink-0 items-center justify-center rounded-xl",
          alert ? "bg-negative/12 text-negative" : "bg-muted text-primary",
        )}
      >
        <CreditCard className="size-[18px]" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-[14px] leading-snug tabular-nums">
          As faturas que vencem no ciclo de {monthLabel} já somam{" "}
          <b>{formatCurrency(commitment.cardBills)}</b>:{" "}
          <b className={alert ? "text-negative" : undefined}>
            {percent(commitment.cardShare)} da renda
          </b>{" "}
          dele.
        </p>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-(--track)"
          role="img"
          aria-label={`${percent(commitment.cardShare)} da renda de ${monthLabel} já vai para faturas`}
        >
          <div
            className={cn("h-full rounded-full", alert ? "bg-negative" : "bg-primary")}
            style={{ width: `${Math.min(100, commitment.cardShare * 100)}%` }}
          />
        </div>
        <p className="text-[13px] leading-snug text-muted-foreground tabular-nums">
          {`Com as contas fixas, ${percent(commitment.totalShare)} da renda de ${monthLabel} já está comprometida`}
          {commitment.overLimit ? ` (seu teto é ${limitPercent}%)` : ""}
          {`. Cada ${formatCurrency(100)} no cartão agora sai da renda de ${monthLabel}.`}
        </p>
        <Link
          href="/cartoes"
          className="flex w-fit items-center gap-0.5 text-[13px] font-medium text-primary underline-offset-4 hover:underline"
        >
          Ver as faturas
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
