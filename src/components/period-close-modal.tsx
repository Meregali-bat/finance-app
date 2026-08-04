"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import { resolvePeriodAllocation } from "@/lib/actions/period";

const KEEP_BALANCE = "__keep__";

export function PeriodCloseModal({
  periodEndIso,
  leftoverAmount,
  jars,
}: {
  periodEndIso: string;
  leftoverAmount: number;
  jars: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(true);
  const [jarId, setJarId] = useState<string>(KEEP_BALANCE);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      await resolvePeriodAllocation(
        periodEndIso,
        leftoverAmount,
        jarId === KEEP_BALANCE ? null : jarId,
      );
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Sobrou {formatCurrency(leftoverAmount)} do período anterior</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">Para onde quer mandar esse valor?</p>
          <Select value={jarId} onValueChange={(v) => setJarId(v as string)}>
            <SelectTrigger className="w-full">
              <SelectValue>
                {(value: string) =>
                  value === KEEP_BALANCE
                    ? "Manter no saldo atual"
                    : jars.find((j) => j.id === value)?.name
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={KEEP_BALANCE}>Manter no saldo atual</SelectItem>
              {jars.map((jar) => (
                <SelectItem key={jar.id} value={jar.id}>
                  {jar.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button onClick={handleConfirm} disabled={isPending}>
            {isPending ? "Confirmando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
