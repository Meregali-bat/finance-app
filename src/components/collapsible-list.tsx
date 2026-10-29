"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Uma lista que mostra as primeiras linhas e abre o resto num toque, como os
 * lembretes da Início. As linhas chegam prontas do servidor; aqui só se decide
 * quantas aparecem. Com uma linha só a mais, ela aparece: "Mostrar mais 1"
 * ocupa o mesmo espaço que a própria linha.
 */
export function CollapsibleList({
  items,
  collapsedCount = 5,
  className,
}: {
  items: React.ReactNode[];
  collapsedCount?: number;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const collapsible = items.length > collapsedCount + 1;
  const shown = collapsible && !expanded ? items.slice(0, collapsedCount) : items;
  const hiddenCount = items.length - shown.length;

  return (
    <>
      <ul className={className}>{shown}</ul>
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="flex h-11 items-center justify-center gap-1.5 rounded-[16px] text-[13.5px] font-medium text-muted-foreground ring-1 ring-(--hairline) transition-[color,background-color,transform] duration-150 hover:bg-card-hover hover:text-foreground active:scale-[0.98]"
        >
          {expanded ? "Mostrar menos" : `Mostrar mais ${hiddenCount}`}
          <ChevronDown
            className={cn("size-4 transition-transform duration-200", expanded && "rotate-180")}
            aria-hidden="true"
          />
        </button>
      )}
    </>
  );
}
