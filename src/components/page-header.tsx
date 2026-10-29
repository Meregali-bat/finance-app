import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * O cabeçalho de uma tela: h1 de 30px (34 no desktop), subtítulo opcional e,
 * à direita, alinhadas embaixo, as ações da tela em botões-ícone. Tracking
 * negativo porque texto grande lê com as letras soltas demais.
 */
export function PageHeader({
  title,
  subtitle,
  backHref,
  backLabel,
  action,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      // Sem subtítulo, o botão alinha pelo meio do título; pelo pé, ele
      // ficava acima do título, como se fossem de linhas diferentes.
      className={`rise-in flex gap-2 ${subtitle ? "items-end" : "items-center"}`}
      style={{ "--rise-delay": "0ms" } as React.CSSProperties}
    >
      {backHref && (
        <Link
          href={backHref}
          aria-label={backLabel ?? "Voltar"}
          className="-ml-2 flex size-11 shrink-0 items-center justify-center self-center rounded-full text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-muted hover:text-foreground active:scale-[0.92]"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <h1
          className={`truncate font-heading leading-[1.05] font-bold tracking-[-0.035em] ${
            backHref ? "text-[26px] lg:text-[30px]" : "text-[30px] lg:text-[34px]"
          }`}
        >
          {title}
        </h1>
        {subtitle && <p className="mt-1 truncate text-[13px] text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-1">{action}</div>}
    </div>
  );
}

/**
 * O título de uma seção dentro da tela, em caixa normal: lê como título, e não
 * como etiqueta gritada em maiúsculas. 18px bold, um degrau claro acima do
 * título de linha (15px semibold) e do `StatLabel` (12,5px, cinza).
 */
export function SectionLabel({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2
      id={id}
      className="font-heading text-[18px] leading-tight font-bold tracking-[-0.025em] text-balance">
      {children}
    </h2>
  );
}

/** O rótulo de um número dentro de um card: diz o que o número é, sem competir com ele. */
export function StatLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={`text-[12.5px] font-medium text-muted-foreground ${className ?? ""}`}>
      {children}
    </p>
  );
}
