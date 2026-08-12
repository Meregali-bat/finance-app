import type { LucideIcon } from "lucide-react";

/**
 * O estado vazio de uma lista. Vinha repetido literalmente em seis telas —
 * aqui ele tem um lugar só, e ganha o ícone e a ação que o parágrafo solto
 * não tinha.
 */
export function EmptyState({
  text,
  hint,
  icon: Icon,
  action,
}: {
  text: string;
  hint?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
}) {
  return (
    // O `max-w` em telas largas evita a caixa de mil e poucos pixels com três
    // palavras perdidas no meio.
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border/70 px-6 py-10 text-center lg:max-w-lg">
      {Icon && (
        <Icon className="size-6 text-muted-foreground/60" aria-hidden="true" strokeWidth={1.5} />
      )}
      <p className="text-sm text-muted-foreground">{text}</p>
      {hint && <p className="text-xs text-muted-foreground/70">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
