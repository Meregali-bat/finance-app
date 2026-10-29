import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ForecastArrowKeys } from "@/components/forecast-arrow-keys";

/**
 * As setas são o alvo de toque mais estreito da tela, então valem 44px (o
 * mínimo confortável para o polegar) e reagem ao toque: com só `hover:`, um
 * toque no celular não deixa rastro nenhum.
 *
 * A reação é de cor, nunca de escala — encolher um alvo desse tamanho tira a
 * borda de baixo do dedo entre o `touchstart` e o `touchend`, e o iOS não
 * dispara o clique. É a mesma lição que o `period-picker` carrega.
 */
const ARROW_CLASS =
  "flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-[14px] text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground active:bg-muted active:text-foreground";

const ARROW_DISABLED_CLASS =
  "flex size-11 shrink-0 items-center justify-center rounded-[14px] text-muted-foreground/30";

/**
 * A barra de navegação entre ciclos previstos. Não tem estado nenhum: os
 * endereços dos vizinhos chegam prontos, calculados no servidor.
 *
 * Isso não é economia de código, é correção. Refazer conta de calendário no
 * navegador, onde o fuso é outro, foi o que fazia uma seta andar dois períodos
 * — a mesma armadilha documentada em `date-range.ts`.
 */
export function ForecastNav({
  label,
  caption,
  previousHref,
  nextHref,
}: {
  label: string;
  caption: string;
  previousHref: string | null;
  nextHref: string | null;
}) {
  return (
    <div className="rise-in flex items-center justify-between gap-2 rounded-[18px] bg-card p-1.5 shadow-[inset_0_0_0_1px_var(--hairline)] lg:w-fit lg:min-w-[24rem] lg:self-start">
      {previousHref ? (
        <Link href={previousHref} className={ARROW_CLASS} aria-label="Ciclo anterior">
          <ChevronLeft className="size-5" aria-hidden="true" />
        </Link>
      ) : (
        // Um botão desativado, e não um enfeite escondido: o leitor de tela
        // anuncia que não há ciclo antes deste.
        <button type="button" disabled className={ARROW_DISABLED_CLASS} aria-label="Ciclo anterior">
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
      )}

      <div className="min-w-0 px-2 text-center">
        <p className="truncate font-heading text-base font-semibold tracking-[-0.01em]">{label}</p>
        <p className="truncate text-xs text-muted-foreground">{caption}</p>
      </div>
      <ForecastArrowKeys previousHref={previousHref} nextHref={nextHref} />

      {nextHref ? (
        <Link href={nextHref} className={ARROW_CLASS} aria-label="Próximo ciclo">
          <ChevronRight className="size-5" aria-hidden="true" />
        </Link>
      ) : (
        <button type="button" disabled className={ARROW_DISABLED_CLASS} aria-label="Próximo ciclo">
          <ChevronRight className="size-5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
