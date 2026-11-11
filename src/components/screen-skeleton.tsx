import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * As peças dos esqueletos de carregamento das telas. Cada tela monta o seu com
 * a altura e a posição dos blocos reais (cabeçalho, card principal, linhas),
 * para o conteúdo entrar no lugar do esqueleto sem empurrar nada.
 *
 * As cores vêm do token `muted`, que já troca com o tema claro/escuro, e o
 * pulso de `Skeleton` para sob `prefers-reduced-motion`.
 */

/** A casca: avisa leitores de tela e herda o espaçamento da tela real. */
export function ScreenSkeleton({
  label = "Carregando",
  className,
  children,
}: {
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn("flex flex-col gap-5 lg:gap-6", className)}
    >
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/**
 * O lugar do `PageHeader`: com subtítulo ele mede 55px (59 no desktop), sem
 * subtítulo a altura é a do botão-ícone, 44px.
 */
export function HeaderSkeleton({
  subtitle = false,
  action = false,
  back = false,
  className,
}: {
  subtitle?: boolean;
  action?: boolean;
  back?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex gap-2",
        subtitle ? "h-[55px] items-end lg:h-[59px]" : "h-11 items-center",
        className,
      )}
    >
      {back && <div className="-ml-2 size-11 shrink-0" />}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <BarSkeleton className="h-8 w-44 rounded-lg lg:h-9" />
        {subtitle && <BarSkeleton className="h-[13px] w-56 max-w-full" />}
      </div>
      {action && <BarSkeleton className="size-11 shrink-0 rounded-full" />}
    </div>
  );
}

/**
 * Uma barra de texto ou ícone sobre o fundo da página. `foreground/10` em vez
 * de `muted`: o `muted` some no fundo escuro e no claro quase não aparece.
 */
export function BarSkeleton({ className }: { className?: string }) {
  return <Skeleton aria-hidden="true" className={cn("bg-foreground/10", className)} />;
}

/**
 * Um bloco com a forma de um card, na mesma superfície dos cards reais (fundo
 * `card` e o anel de 1px), para o esqueleto ter o peso da tela que vai chegar.
 * A altura vem de quem usa.
 */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <Skeleton
      aria-hidden="true"
      className={cn("rounded-[20px] bg-card shadow-(--shadow-card)", className)}
    />
  );
}

/** A barra de seleção de período (Previsão, Histórico): 56px, meia largura no desktop. */
export function PickerSkeleton() {
  return <CardSkeleton className="h-14 lg:w-96" />;
}

/** Linhas de lista: 64px cada, no ritmo das linhas reais. */
export function RowsSkeleton({
  count = 4,
  className,
  rowClassName,
}: {
  count?: number;
  className?: string;
  rowClassName?: string;
}) {
  return (
    <div aria-hidden="true" className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} className={cn("h-16", rowClassName)} />
      ))}
    </div>
  );
}
