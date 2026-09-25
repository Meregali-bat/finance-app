"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function DeleteIconButton({
  action,
  confirmMessage,
}: {
  action: () => Promise<void>;
  confirmMessage: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  // Uma exclusão recusada (caixinha com saldo, cartão com assinatura) precisa
  // dizer por quê; antes o erro subia sem ninguém para mostrá-lo.
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Excluir"
        disabled={isPending}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-4" />
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setError(null);
        }}
        title={error ? "Não deu para excluir" : "Excluir?"}
        description={error ?? confirmMessage}
        confirmLabel="Excluir"
        destructive
        isPending={isPending}
        onConfirm={() => {
          startTransition(async () => {
            try {
              await action();
              setOpen(false);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Erro ao excluir");
            }
          });
        }}
      />
    </>
  );
}
