"use client";

import { unwrap } from "@/lib/action-result";
import { useState, useTransition } from "react";
import { Trash2, Undo2 } from "lucide-react";
import { iconButton } from "@/components/ui/icon-button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { errorMessage } from "@/lib/error-message";

export function DeleteIconButton({
  action,
  confirmMessage,
  className,
  undo = false,
  itemLabel,
  disabledReason,
  title,
}: {
  action: () => Promise<unknown>;
  confirmMessage: string;
  className?: string;
  /** Desfazer uma marcação (pagamento, recebimento), e não apagar: outra
   *  palavra, outro ícone, e o botão de confirmar sem o tom de perigo. */
  undo?: boolean;
  /** O que a linha é: entra no nome do botão, para três "Desfazer" seguidos
   *  não soarem iguais no leitor de tela. */
  itemLabel?: string;
  /** Por que não dá para excluir agora: o botão fica apagado e diz isso. */
  disabledReason?: string;
  /** A dica do botão, quando "Desfazer pagamento" não é o que ele desfaz. */
  title?: string;
}) {
  const verb = undo ? "Desfazer" : "Excluir";
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  // Uma exclusão recusada (caixinha com saldo, cartão com assinatura) precisa
  // dizer por quê; antes o erro subia sem ninguém para mostrá-lo.
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        aria-label={itemLabel ? `${verb}: ${itemLabel}` : verb}
        title={
          disabledReason ??
          title ??
          (undo ? "Desfazer pagamento" : itemLabel ? `${verb}: ${itemLabel}` : verb)
        }
        // Continua focável e tocável quando não dá: o toque abre o motivo. Só
        // com `disabled`, o motivo morava numa dica que o celular não mostra.
        aria-disabled={disabledReason ? true : undefined}
        disabled={isPending}
        onClick={() => setOpen(true)}
        className={iconButton({
          tone: "ghost",
          size: "sm",
          className: [className, disabledReason && "opacity-50"].filter(Boolean).join(" "),
        })}
      >
        {undo ? <Undo2 aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setError(null);
        }}
        title={
          disabledReason
            ? `Ainda não dá para ${verb.toLowerCase()}`
            : error
              ? `Não deu para ${verb.toLowerCase()}`
              : `${verb}?`
        }
        description={disabledReason ?? error ?? confirmMessage}
        confirmLabel={disabledReason ? "Entendi" : verb}
        destructive={!undo && !disabledReason}
        isPending={isPending}
        onConfirm={() => {
          if (disabledReason) {
            setOpen(false);
            return;
          }
          startTransition(async () => {
            try {
              unwrap(await action());
              setOpen(false);
            } catch (e) {
              setError(errorMessage(e, `Erro ao ${verb.toLowerCase()}`));
            }
          });
        }}
      />
    </>
  );
}
