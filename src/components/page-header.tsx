import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * O cabeçalho de uma tela. Centraliza a escala do `<h1>` — tracking negativo
 * porque texto grande lê com as letras soltas demais no espaçamento normal.
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
    <div className="flex items-center gap-2">
      {backHref && (
        <Link
          href={backHref}
          aria-label={backLabel ?? "Voltar"}
          className="-ml-2 flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-heading text-2xl leading-tight font-semibold tracking-[-0.02em] lg:text-3xl">
          {title}
        </h1>
        {subtitle && <p className="mt-0.5 truncate text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
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
