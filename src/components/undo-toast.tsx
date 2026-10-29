"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CircleCheck } from "lucide-react";
import {
  pauseTimer,
  resumeTimer,
  startTimer,
  type PausableTimer,
} from "@/lib/pausable-timer";

export type UndoToastState = { id: number; text: string; hasUndo: boolean } | null;

/**
 * Quanto tempo o "Desfazer" fica na tela depois de uma ação de dinheiro. O
 * mesmo para todas: pagar, receber, guardar. Parado enquanto o mouse está em
 * cima, o foco do teclado está dentro ou a aba está escondida.
 */
export const UNDO_MS = 8000;
/** Depois de uma pausa, o aviso nunca some antes disso. */
const RESUME_MIN_MS = 1500;
/** Por quanto tempo, depois de aparecer, o toast segura um foco que se perdeu. */
const RESCUE_WINDOW_MS = 2500;

const subscribeNothing = () => () => {};

type HoldReason = "hover" | "focus" | "hidden";

/**
 * O prazo do toast, que para e continua de onde parou. Uma chave nova (um
 * toast novo) recomeça do zero.
 */
function usePausableTimeout(key: number | null, duration: number, onExpire: () => void) {
  const expire = useRef(onExpire);
  useEffect(() => {
    expire.current = onExpire;
  });
  const timer = useRef<PausableTimer | null>(null);
  const handle = useRef(0);
  const holds = useRef(new Set<HoldReason>());

  const arm = useCallback(() => {
    window.clearTimeout(handle.current);
    const t = timer.current;
    if (!t || t.startedAt === null) return;
    handle.current = window.setTimeout(() => {
      timer.current = null;
      expire.current();
    }, t.remaining);
  }, []);

  const hold = useCallback(
    (reason: HoldReason, on: boolean) => {
      const t = timer.current;
      if (!t) return;
      const set = holds.current;
      const wasHeld = set.size > 0;
      if (on) set.add(reason);
      else set.delete(reason);
      const held = set.size > 0;
      if (held === wasHeld) return;
      const now = performance.now();
      if (held) {
        window.clearTimeout(handle.current);
        timer.current = pauseTimer(t, now);
      } else {
        timer.current = resumeTimer(t, now, RESUME_MIN_MS);
        arm();
      }
    },
    [arm],
  );

  useEffect(() => {
    if (key === null) return;
    // O ponteiro e o foco eram do toast anterior: o novo começa solto.
    holds.current = new Set();
    timer.current = startTimer(duration, performance.now());
    arm();
    if (document.visibilityState === "hidden") hold("hidden", true);
    const onVisibility = () => hold("hidden", document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(handle.current);
      timer.current = null;
    };
  }, [key, duration, arm, hold]);

  return hold;
}

/**
 * O aviso depois de uma ação reversível: check turquesa, o que aconteceu e
 * "Desfazer". Entra subindo de baixo; no celular fica acima da barra
 * inferior — e acima do "+" fixo, quando a tela tem um —, no desktop no
 * canto. O toast cuida do próprio prazo (`UNDO_MS`, com pausa) e chama
 * `onDismiss` quando ele acaba.
 *
 * Acessível sem ver: uma região `polite`, sempre presente, anuncia "Aluguel
 * paga. Desfazer disponível." Se a ação tirou da tela o elemento que tinha o
 * foco (o card pago, o diálogo que fechou), o foco cai no "Desfazer" em vez
 * de ir parar no `body`; senão ele fica onde está. Quando o toast sai com o
 * foco dentro (desfez, Esc, acabou o prazo), `restoreFocus` diz para onde
 * ele volta.
 *
 * No `body`: a entrada das seções deixa um `transform` nos ancestrais, e um
 * `fixed` dentro deles se prenderia à seção em vez da tela.
 */
export function UndoToast({
  toast,
  onUndo,
  onDismiss,
  undoing,
  restoreFocus,
}: {
  toast: UndoToastState;
  onUndo: () => void;
  /** O prazo acabou (ou Esc): quem chama tira o toast. */
  onDismiss: () => void;
  undoing?: boolean;
  restoreFocus?: (reason: "undo" | "dismiss") => HTMLElement | null | undefined;
}) {
  const mounted = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  const reduceMotion = useReducedMotion();
  const textId = useId();
  const live = useRef<HTMLDivElement>(null);
  const undoButton = useRef<HTMLButtonElement>(null);
  const closing = useRef<"undo" | "dismiss">("dismiss");
  const restore = useRef(restoreFocus);
  useEffect(() => {
    restore.current = restoreFocus;
  });

  const id = toast?.id ?? null;
  const hasUndo = toast?.hasUndo ?? false;
  const text = toast?.text ?? "";
  const hold = usePausableTimeout(id, UNDO_MS, onDismiss);

  // O anúncio: escrito numa região que já existia, que é o que os leitores
  // de tela de fato leem (uma região que nasce com o texto costuma ficar muda).
  // Limpa e escreve no quadro seguinte, para o mesmo texto duas vezes seguidas
  // ser lido de novo.
  useEffect(() => {
    const region = live.current;
    if (id === null || !region) return;
    region.textContent = "";
    const frame = requestAnimationFrame(() => {
      region.textContent = hasUndo ? `${text}. Desfazer disponível.` : text;
    });
    return () => cancelAnimationFrame(frame);
  }, [id, text, hasUndo]);

  // O foco que a ação derrubou. Quem tinha o foco quando o toast apareceu
  // (o "Pagar", um botão do diálogo) pode sumir logo depois — o card sai
  // animando, o diálogo desmonta —, e o foco iria para o `body`, no começo
  // da página. Só nesse caso ele vem para o "Desfazer"; um clique fora ou um
  // foco que ainda existe nunca é puxado. Sem "Desfazer" (adiar), o foco vai
  // direto para onde iria na saída do toast.
  useEffect(() => {
    if (id === null) return;
    const origin = document.activeElement;
    const rescue = () => {
      const active = document.activeElement;
      const lost = !active || active === document.body;
      const originGone = !origin || origin === document.body || !origin.isConnected;
      if (!lost || !originGone) return;
      const target = hasUndo ? undoButton.current : restore.current?.("dismiss");
      target?.focus({ preventScroll: true });
    };
    const frame = requestAnimationFrame(rescue);
    const observer = new MutationObserver(rescue);
    observer.observe(document.body, { childList: true, subtree: true });
    const stop = window.setTimeout(() => observer.disconnect(), RESCUE_WINDOW_MS);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.clearTimeout(stop);
    };
  }, [id, hasUndo]);

  // A saída com o foco dentro: antes de o toast sumir, o foco vai para onde
  // quem chamou mandar (o card seguinte, o título da lista).
  useLayoutEffect(() => {
    if (id === null) return;
    closing.current = "dismiss";
    return () => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !active.closest("[data-undo-toast]")) return;
      const target = restore.current?.(closing.current);
      if (target?.isConnected) target.focus({ preventScroll: true });
      else active.blur();
    };
  }, [id]);

  if (!mounted) return null;
  return createPortal(
    <>
      <div ref={live} role="status" aria-live="polite" aria-atomic="true" className="sr-only" />
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            data-undo-toast=""
            initial={reduceMotion ? { opacity: 0 } : { y: 120, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { y: 120, opacity: 0 }}
            transition={{
              y: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
              opacity: { duration: reduceMotion ? 0.15 : 0.3 },
            }}
            onPointerEnter={() => hold("hover", true)}
            onPointerLeave={() => hold("hover", false)}
            // Só o foco do teclado segura o prazo: o "Desfazer" focado por
            // programa depois de um clique não deixaria o toast nunca sair.
            onFocus={(e) => hold("focus", e.target.matches(":focus-visible"))}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) hold("focus", false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                onDismiss();
              }
            }}
            // O "+" fixo do celular (`data-fab`) ocupa o canto de baixo: com
            // ele na tela, o toast sobe para cima dele (74px da barra + 58px
            // do botão + 10px de folga) em vez de cobri-lo.
            className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-30 flex items-center gap-3 rounded-2xl bg-toast py-2.5 pr-2 pl-3.5 text-sm font-medium text-(--toast-foreground) shadow-[0_16px_40px_-12px_rgb(0_0_0/0.9),inset_0_0_0_1px_rgb(247_236_233/0.12)] max-lg:[body:has([data-fab])_&]:bottom-[calc(env(safe-area-inset-bottom)+142px)] lg:inset-x-auto lg:right-8 lg:bottom-8 lg:w-[360px]"
          >
            <CircleCheck
              className="size-[22px] shrink-0 text-(--toast-positive)"
              aria-hidden="true"
            />
            <span id={textId} className="min-w-0 flex-1 truncate">
              {toast.text}
            </span>
            {toast.hasUndo && (
              <button
                ref={undoButton}
                type="button"
                aria-describedby={textId}
                onClick={() => {
                  closing.current = "undo";
                  onUndo();
                }}
                disabled={undoing}
                className="h-9 shrink-0 rounded-[10px] px-3 text-[13px] font-semibold text-(--toast-action) transition-colors outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-(--toast-action) active:scale-[0.97] motion-reduce:active:scale-100"
              >
                Desfazer
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>,
    document.body,
  );
}
