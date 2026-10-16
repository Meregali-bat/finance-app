"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { listRowSurface, stagger } from "@/components/list-row";
import { HistoryRow } from "@/components/movement-row";
import { historyItemKey, type HistoryItem } from "@/lib/history-item";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export type CategoryGroup = {
  key: string;
  name: string;
  amount: number;
  percent: number;
  items: HistoryItem[];
};

export function CategoryBreakdown({
  groups,
  cards,
  categories,
}: {
  groups: CategoryGroup[];
  cards: { id: string; name: string }[];
  categories: { id: string; name: string }[];
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      {groups.map((group, index) => {
        const isOpen = openKey === group.key;
        return (
          <div
            key={group.key}
            className={listRowSurface("rise-in flex flex-col gap-2 px-3.5")}
            style={stagger(index)}
          >
            <button
              type="button"
              onClick={() => setOpenKey(isOpen ? null : group.key)}
              aria-expanded={isOpen}
              className="flex flex-col gap-2.5 py-0.5 text-left"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-[14.5px] font-semibold">{group.name}</p>
                <div className="flex shrink-0 items-center gap-2 text-sm">
                  <span className="font-semibold tabular-nums">{formatCurrency(group.amount)}</span>
                  <span className="text-muted-foreground tabular-nums">{group.percent}%</span>
                  <ChevronDown
                    className={cn(
                      "size-4 text-muted-foreground transition-transform duration-300 ease-out-quint",
                      isOpen && "rotate-180",
                    )}
                    aria-hidden="true"
                  />
                </div>
              </div>
              <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-black/30">
                <span
                  className="grow-right block h-full rounded-full bg-primary"
                  style={
                    {
                      width: `${Math.min(100, group.percent)}%`,
                      "--grow-delay": `${200 + index * 60}ms`,
                    } as React.CSSProperties
                  }
                />
              </span>
            </button>
            {/* Altura animada: fechar no meio da abertura reverte de onde
                  está, em vez de esperar terminar para então voltar. */}
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  key="items"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col gap-2 border-t border-border/60 pt-3 pb-1">
                    {group.items.map((item) => (
                      <HistoryRow
                        key={historyItemKey(item)}
                        item={item}
                        cards={cards}
                        categories={categories}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
