"use client";

import { unwrap } from "@/lib/action-result";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { UndoToast, type UndoToastState } from "@/components/undo-toast";
import { errorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";

/**
 * Liga e desliga uma renda ou despesa. Um interruptor, e não mais o selo
 * "Ativa/Inativa": o estado e a ação são a mesma coisa, e o selo não parecia
 * clicável. Muda na hora (otimista) e volta se a action falhar, dizendo por quê.
 */
export function ToggleActiveButton({
  active,
  onToggle,
  label,
  titles,
  confirmOff,
  doneText,
}: {
  active: boolean;
  onToggle: (next: boolean) => Promise<unknown>;
  /** O que o interruptor liga, para o leitor de tela: "Ativar Internet". */
  label?: string;
  /** A dica de cada lado: "Pausar…" quando ligado, "Retomar" quando desligado. */
  titles?: { on: string; off: string };
  /** Desligar pede confirmação, com o que muda — a última renda, por exemplo. */
  confirmOff?: { title: string; description: string };
  /**
   * O que mudou, num toast com "Desfazer": só o interruptor mudando de cor
   * não dizia que a Previsão mudou junto. `off` é o texto de quando desligou.
   */
  doneText?: { on: string; off: string };
}) {
  const [isPending, startTransition] = useTransition();
  const [on, setOn] = useOptimistic(active);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<UndoToastState>(null);
  const [undoing, startUndo] = useTransition();
  const seq = useRef(0);

  function flip() {
    const next = !on;
    setError(null);
    startTransition(async () => {
      setOn(next);
      try {
        unwrap(await onToggle(next));
        if (doneText) {
          setToast({ id: ++seq.current, hasUndo: true, text: next ? doneText.on : doneText.off });
        }
      } catch (e) {
        // O otimista volta sozinho quando a transição acaba; o motivo fica na
        // dica e, com toast, também na tela.
        const message = errorMessage(e, "Não deu para mudar. Tente de novo.");
        setError(message);
        if (doneText) setToast({ id: ++seq.current, hasUndo: false, text: message });
      }
    });
  }

  function undo() {
    // Desfazer é virar de volta: o estado de agora já é o que o servidor tem.
    startUndo(async () => {
      try {
        unwrap(await onToggle(!active));
        setToast(null);
      } catch (e) {
        setToast({
          id: ++seq.current,
          hasUndo: false,
          text: errorMessage(e, "Não deu para desfazer. Tente de novo."),
        });
      }
    });
  }

  return (
    <>
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label ?? (on ? "Desativar" : "Ativar")}
      aria-invalid={error ? true : undefined}
      title={error ?? (titles ? (on ? titles.on : titles.off) : on ? "Ativa" : "Inativa")}
      disabled={isPending}
      onClick={() => (on && confirmOff ? setAsking(true) : flip())}
      // A área de toque é de 44px; o trilho desenhado, de 34×20.
      className="group/switch flex size-11 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:size-[38px]"
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative h-5 w-[34px] rounded-full transition-colors duration-200",
          on ? "bg-primary" : "bg-secondary",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-4 rounded-full transition-[translate,background-color] duration-[280ms] ease-[cubic-bezier(0.34,1.2,0.64,1)]",
            on ? "translate-x-3.5 bg-background" : "bg-muted-foreground",
          )}
        />
      </span>
    </button>
    {error && (
      <span role="alert" className="sr-only">
        {error}
      </span>
    )}
    {confirmOff && (
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title={confirmOff.title}
        description={confirmOff.description}
        confirmLabel="Pausar"
        onConfirm={() => {
          setAsking(false);
          flip();
        }}
      />
    )}
    {doneText && (
      <UndoToast
        toast={toast}
        undoing={undoing}
        onUndo={undo}
        onDismiss={() => setToast(null)}
      />
    )}
    </>
  );
}
