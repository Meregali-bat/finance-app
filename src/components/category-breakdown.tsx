"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { springDefault } from "@/lib/motion";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
      {groups.map((group) => {
        const isOpen = openKey === group.key;
        return (
          <Card key={group.key}>
            <CardContent className="flex flex-col gap-2 py-3">
              <button
                type="button"
                onClick={() => setOpenKey(isOpen ? null : group.key)}
                aria-expanded={isOpen}
                className="flex flex-col gap-2 py-1 text-left"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate font-medium">{group.name}</p>
                  <div className="flex shrink-0 items-center gap-2 text-sm">
                    <span className="font-medium tabular-nums">{formatCurrency(group.amount)}</span>
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
                <Progress value={group.percent} />
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
                    transition={springDefault}
                    className="overflow-hidden"
                  >
                    <div className="flex flex-col gap-2 border-t border-border pt-3">
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
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
