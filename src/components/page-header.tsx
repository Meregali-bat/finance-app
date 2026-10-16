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
      className="rise-in flex items-end gap-2"
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
 * Rótulo de uma seção dentro da tela. Texto pequeno pede tracking positivo —
 * o oposto do `<h1>`.
 */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
      {children}
    </h2>
  );
}
