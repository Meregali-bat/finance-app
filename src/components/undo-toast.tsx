"use client";

import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { CircleCheck } from "lucide-react";

export type UndoToastState = { id: number; text: string; hasUndo: boolean } | null;

/**
 * O aviso depois de uma ação reversível: check turquesa, o que aconteceu e
 * "Desfazer". Entra subindo de baixo; no celular fica acima da barra
 * inferior, no desktop no canto. Quem chama controla o tempo na tela.
 *
 * No `body`: a entrada das seções deixa um `transform` nos ancestrais, e um
 * `fixed` dentro deles se prenderia à seção em vez da tela. O toast só existe
 * depois de um clique, então `document` já está lá.
 */
export function UndoToast({
  toast,
  onUndo,
  undoing,
}: {
  toast: UndoToastState;
  onUndo: () => void;
  undoing?: boolean;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.id}
          role="status"
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 120, opacity: 0 }}
          transition={{
            y: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
            opacity: { duration: 0.3 },
          }}
          className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-30 flex items-center gap-3 rounded-2xl bg-toast py-2.5 pr-2 pl-3.5 text-sm font-medium shadow-[0_16px_40px_-12px_rgb(0_0_0/0.9),inset_0_0_0_1px_rgb(247_236_233/0.12)] lg:inset-x-auto lg:right-8 lg:bottom-8 lg:w-[360px]"
        >
          <CircleCheck className="size-[22px] shrink-0 text-positive" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{toast.text}</span>
          {toast.hasUndo && (
            <button
              type="button"
              onClick={onUndo}
              disabled={undoing}
              className="h-9 shrink-0 rounded-[10px] px-3 text-[13px] font-semibold text-primary transition-colors hover:bg-white/5 active:scale-[0.97]"
            >
              Desfazer
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
