"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, ArrowDownLeft, Check, CircleCheck, Clock } from "lucide-react";
import { SectionLabel } from "@/components/page-header";
import { ConfirmPaymentDialog } from "@/components/confirm-payment-dialog";
import { MarkIncomeReceivedDialog } from "@/components/mark-income-received-dialog";
import { DeferExpenseDialog } from "@/components/defer-expense-dialog";
import { iconButton } from "@/components/ui/icon-button";
import { homeCard } from "@/components/home-card";
import { unmarkExpensePayment } from "@/lib/actions/expense-payment";
import { unmarkIncomeReceived } from "@/lib/actions/income-receipt";
import { cn } from "@/lib/utils";

type Base = {
  key: string;
  label: string;
  amount: number;
  dueDate: Date;
  /**
   * "R$ 1.800,00 · vence em 18 de out.", montado no servidor: formatada aqui,
   * a data sairia no fuso do browser e poderia discordar do HTML.
   */
  detail: string;
};

export type HomeReminder =
  | (Base & {
      kind: "due";
      payAction: (formData: FormData) => Promise<{ paymentId: string }>;
      cards?: { id: string; name: string }[];
      defer: {
        action: (formData: FormData) => Promise<void>;
        nextMonthTarget: Date;
        endTarget: Date | null;
      } | null;
      deferredIn: number;
    })
  | (Base & { kind: "income"; incomeId: string });

type Toast = {
  id: number;
  key: string;
  text: string;
  undo?: () => Promise<void>;
};

/** O tempo do check turquesa antes de o card começar a sair. */
const CONFIRM_MS = 380;
const TOAST_MS = 4000;

/**
 * Os lembretes da Início. Confirmar no diálogo não some com o card de
 * repente: o check fica turquesa, o card sai deslizando e encolhendo, e um
 * toast oferece "Desfazer" por 4s. O card some na hora, sem esperar o
 * servidor — quando a página volta revalidada, ele já não vem mais.
 */
export function HomeReminders({ reminders }: { reminders: HomeReminder[] }) {
  const reduceMotion = useReducedMotion();
  // Confirmados, aguardando a saída (check turquesa)…
  const [confirmed, setConfirmed] = useState<Set<string>>(() => new Set());
  // …e já fora da lista.
  const [gone, setGone] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState<Toast | null>(null);
  const [undoing, startUndo] = useTransition();
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => window.clearTimeout(t));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(t);
  }, [toast]);

  function finish(key: string, text: string, undo?: () => Promise<void>) {
    setConfirmed((s) => new Set(s).add(key));
    timers.current.push(
      window.setTimeout(
        () => {
          setGone((s) => new Set(s).add(key));
          setToast({ id: Date.now(), key, text, undo });
        },
        reduceMotion ? 0 : CONFIRM_MS,
      ),
    );
  }

  function undo() {
    if (!toast?.undo) return;
    const { key, undo: run } = toast;
    setToast(null);
    startUndo(async () => {
      await run();
      // Depois da action, que já revalidou a página: o lembrete volta dos
      // props, e só então deixa de estar escondido.
      const drop = (s: Set<string>) => {
        const next = new Set(s);
        next.delete(key);
        return next;
      };
      setGone(drop);
      setConfirmed(drop);
    });
  }

  const visible = reminders.filter((r) => !gone.has(r.key));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <SectionLabel>Lembretes</SectionLabel>
        {visible.length > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-secondary px-1.5 text-[11px] font-semibold tabular-nums">
            {visible.length}
          </span>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-[20px] border border-dashed border-border/70 px-6 py-8 text-center">
          <CircleCheck
            className="mb-1 size-6 text-positive"
            aria-hidden="true"
            strokeWidth={1.75}
          />
          <p className="text-sm font-medium">Tudo em dia.</p>
          <p className="text-[13px] text-muted-foreground">Nenhum lembrete pendente.</p>
        </div>
      ) : (
        <ul className="flex flex-col">
          <AnimatePresence initial={false}>
            {visible.map((reminder) => (
              <motion.li
                key={reminder.key}
                // A saída em duas camadas, como no handoff: some primeiro, e
                // só então desliza e fecha o espaço que ocupava.
                exit={{
                  opacity: [1, 0],
                  x: 24,
                  height: 0,
                  marginBottom: 0,
                  transition: {
                    opacity: { duration: 0.26 },
                    x: {
                      duration: 0.42,
                      delay: 0.12,
                      ease: [0.22, 1, 0.36, 1],
                    },
                    height: {
                      duration: 0.42,
                      delay: 0.12,
                      ease: [0.22, 1, 0.36, 1],
                    },
                    marginBottom: {
                      duration: 0.42,
                      delay: 0.12,
                      ease: [0.22, 1, 0.36, 1],
                    },
                  },
                }}
                className="mb-2.5 overflow-hidden last:mb-0"
              >
                <ReminderCard
                  reminder={reminder}
                  confirmed={confirmed.has(reminder.key)}
                  onPaid={(undoFn) =>
                    finish(
                      reminder.key,
                      reminder.kind === "income"
                        ? `${reminder.label} recebido`
                        : `${reminder.label} paga`,
                      undoFn,
                    )
                  }
                  onDeferred={() => finish(reminder.key, `${reminder.label} adiada`)}
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {/* No `body`: a entrada da seção deixa um `transform` no ancestral, e
          um `fixed` dentro dele se prenderia à seção em vez da tela. O toast
          só existe depois de um clique, então `document` já está lá. */}
      {typeof document !== "undefined" &&
        createPortal(
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
                {toast.undo && (
                  <button
                    type="button"
                    onClick={undo}
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
        )}
    </div>
  );
}

function ReminderCard({
  reminder,
  confirmed,
  onPaid,
  onDeferred,
}: {
  reminder: HomeReminder;
  confirmed: boolean;
  onPaid: (undo: () => Promise<void>) => void;
  onDeferred: () => void;
}) {
  const isIncome = reminder.kind === "income";
  const payLabel = isIncome ? "Marcar como recebida" : "Marcar como paga";
  const payTrigger = {
    label: payLabel,
    icon: <Check aria-hidden="true" strokeWidth={2.5} />,
    className: iconButton({
      size: "sm",
      className: confirmed ? "bg-positive text-positive-foreground hover:bg-positive" : undefined,
    }),
  };

  return (
    <div
      className={homeCard("flex items-center gap-3 py-3.5 pr-3.5 pl-4 lg:py-3.5 lg:pr-3.5 lg:pl-4")}
    >
      <div
        className={cn(
          "flex size-[38px] shrink-0 items-center justify-center rounded-xl",
          isIncome ? "bg-positive/12 text-positive" : "bg-negative/12 text-negative",
        )}
      >
        {isIncome ? (
          <ArrowDownLeft className="size-[18px]" aria-hidden="true" />
        ) : (
          <AlertTriangle className="size-[18px]" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{reminder.label}</p>
        {/* Sem `truncate`: quebrar numa segunda linha preserva a data, que era
            o que o "…" comia. */}
        <p className="text-[13px] text-muted-foreground tabular-nums">{reminder.detail}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {reminder.kind === "due" && reminder.defer && (
          <DeferExpenseDialog
            action={reminder.defer.action}
            label={reminder.label}
            dueDate={reminder.dueDate}
            amount={reminder.amount}
            nextMonthTarget={reminder.defer.nextMonthTarget}
            endTarget={reminder.defer.endTarget}
            trigger={{
              label: "Adiar",
              icon: <Clock aria-hidden="true" />,
              className: iconButton({ tone: "ghost", size: "sm" }),
            }}
            onDone={onDeferred}
          />
        )}
        {reminder.kind === "income" ? (
          <MarkIncomeReceivedDialog
            incomeId={reminder.incomeId}
            label={reminder.label}
            dueDate={reminder.dueDate}
            amount={reminder.amount}
            trigger={payTrigger}
            onDone={({ incomeId, occurrenceDate }) =>
              onPaid(() => unmarkIncomeReceived(incomeId, occurrenceDate))
            }
          />
        ) : (
          <ConfirmPaymentDialog
            action={reminder.payAction}
            cards={reminder.cards}
            label={reminder.label}
            dueDate={reminder.dueDate}
            amount={reminder.amount}
            trigger={payTrigger}
            onDone={({ paymentId }) => onPaid(() => unmarkExpensePayment(paymentId))}
          />
        )}
      </div>
    </div>
  );
}
