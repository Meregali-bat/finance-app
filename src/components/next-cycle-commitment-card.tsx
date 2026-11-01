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
  // As larguras da barra, em % da renda: até o teto, faturas e depois contas
  // fixas; o que passa do teto (seja de qual for), em vermelho.
  const limit = Math.min(100, limitPercent);
  const total = Math.min(100, commitment.totalShare * 100);
  const within = Math.min(total, limit);
  const cardWidth = Math.min(commitment.cardShare * 100, within);
  const fixedWidth = Math.max(0, within - cardWidth);
  const overWidth = Math.max(0, total - within);
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

      {/* Logo depois do alerta, o que ele muda para o número de hoje: o
          conforto antes da barra, e não depois. */}
      <p className="text-[13px] text-pretty text-muted-foreground">
        {reservedNow
          ? "O número de hoje já guarda uma parte; cada compra no cartão agora aumenta o que vence lá."
          : "O número de hoje não muda; cada compra no cartão agora aumenta o que vence lá."}
      </p>

      {/* As faturas em tom forte, as contas fixas em tom médio (cada um com
          3:1 do vizinho e do fundo), e um traço no teto. Vermelho, só o que
          passa do teto: a cor de alerta marca o problema, e não uma
          categoria. */}
      <div className="flex flex-col gap-1.5">
        <div className="relative h-2 rounded-full bg-(--track)" aria-hidden="true">
          {/* Três trechos lado a lado, sem sobreposição: até o teto, faturas e
              contas fixas; o que passa dele, em vermelho. O vão entre eles
              separa as cores, e a marca do teto cai no vão. */}
          <div className="flex h-full gap-0.5 overflow-hidden rounded-full">
            <div className="bg-foreground/90" style={{ width: `${cardWidth}%` }} />
            <div
              className="bg-foreground/55 dark:bg-foreground/40"
              style={{ width: `${fixedWidth}%` }}
            />
            {overWidth > 0 && <div className="bg-negative" style={{ width: `${overWidth}%` }} />}
          </div>
          <span
            className="absolute -top-1 h-4 w-0.5 rounded-full bg-foreground/70"
            style={{ left: `calc(${limit}% - 1px)` }}
          />
        </div>
        {/* O traço dito em palavras, embaixo dele: sem isso, o leitor tinha de
            adivinhar o que a marca na barra queria dizer. */}
        <div className="relative h-[18px] text-[11.5px] text-muted-foreground tabular-nums">
          <span
            className="absolute -translate-x-1/2 whitespace-nowrap"
            style={{ left: `${Math.min(92, Math.max(8, limitPercent))}%` }}
          >
            teto {limitPercent}%
            {/* O excesso é parte das faturas e contas fixas, não uma terceira
                fatia: vai junto do teto, e a legenda continua somando o total. */}
            {commitment.overLimit && (
              <span className="text-negative">
                {" "}
                · {Math.round(commitment.totalShare * 100) - limitPercent} pontos acima
              </span>
            )}
          </span>
        </div>
        <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px] text-muted-foreground tabular-nums">
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2 rounded-full bg-foreground/90" />
            Faturas {formatCurrency(commitment.cardBills)} ({percent(commitment.cardShare)})
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2 rounded-full bg-foreground/55 dark:bg-foreground/40" />
            Contas fixas {formatCurrency(commitment.fixed)} ({percent(fixedShare)})
          </li>
        </ul>
      </div>

      {/* Para onde ir. */}
      <Link
        href="/previsao?p=1"
        className="-my-1 flex min-h-11 w-fit items-center gap-0.5 text-[13px] font-medium text-primary underline-offset-4 hover:underline"
      >
        Ver esse ciclo na Previsão
        <ChevronRight className="size-3.5" aria-hidden="true" />
      </Link>
    </section>
  );
}
