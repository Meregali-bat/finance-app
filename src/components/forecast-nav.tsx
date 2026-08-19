import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

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
  "flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-xl text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground active:bg-muted active:text-foreground";

const ARROW_DISABLED_CLASS =
  "flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground/30";

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
    <div className="flex items-center justify-between gap-2 rounded-2xl bg-card p-2 shadow-surface ring-1 ring-foreground/10 lg:w-fit lg:gap-6 lg:self-start">
      {previousHref ? (
        <Link href={previousHref} className={ARROW_CLASS} aria-label="Período anterior">
          <ChevronLeft className="size-5" aria-hidden="true" />
        </Link>
      ) : (
        <span className={ARROW_DISABLED_CLASS} aria-hidden="true">
          <ChevronLeft className="size-5" />
        </span>
      )}

      <div className="min-w-0 px-2 text-center">
        <p className="truncate font-heading font-medium">{label}</p>
        <p className="truncate text-xs text-muted-foreground">{caption}</p>
      </div>

      {nextHref ? (
        <Link href={nextHref} className={ARROW_CLASS} aria-label="Próximo período">
          <ChevronRight className="size-5" aria-hidden="true" />
        </Link>
      ) : (
        <span className={ARROW_DISABLED_CLASS} aria-hidden="true">
          <ChevronRight className="size-5" />
        </span>
      )}
    </div>
  );
}
