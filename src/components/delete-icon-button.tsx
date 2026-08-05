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
        onOpenChange={setOpen}
        title="Excluir?"
        description={confirmMessage}
        confirmLabel="Excluir"
        destructive
        isPending={isPending}
        onConfirm={() => {
          startTransition(async () => {
            await action();
            setOpen(false);
          });
        }}
      />
    </>
  );
}
