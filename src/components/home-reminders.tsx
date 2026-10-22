"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  AlertTriangle,
  ArrowDownLeft,
  CalendarClock,
  Check,
  CircleCheck,
  Clock,
  ChevronDown,
} from "lucide-react";
import { SectionLabel } from "@/components/page-header";
import { UndoToast } from "@/components/undo-toast";
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
  /** Já passou do vencimento: só esse leva o alerta em coral. */
  overdue: boolean;
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
      /** Despesa fixa e fatura: libera o "Pagar parcial". */
      allowPartial: boolean;
      paidSoFar: number;
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
/** Quantos lembretes a Início mostra antes do "Mostrar mais". */
const COLLAPSED_COUNT = 4;

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

  /** Parcial: o card fica, só com o que falta, e o toast oferece desfazer. */
  function partial(key: string, text: string, undo: () => Promise<void>) {
    // No setTimeout, como em `finish`: chamar Date.now() direto no handler
    // a regra de pureza do React não aceita.
    timers.current.push(window.setTimeout(() => setToast({ id: Date.now(), key, text, undo }), 0));
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
  // No celular, doze lembretes empurram o resto da Início para longe: os
  // primeiros (os vencidos vêm na frente) ficam à vista, o resto abre num toque.
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? visible : visible.slice(0, COLLAPSED_COUNT);
  const hiddenCount = visible.length - shown.length;

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
            {shown.map((reminder) => (
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
                  onPartial={(undoFn) =>
                    partial(reminder.key, `Pagamento parcial de ${reminder.label}`, undoFn)
                  }
                  onDeferred={() => finish(reminder.key, `${reminder.label} adiada`)}
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {(hiddenCount > 0 || (expanded && visible.length > COLLAPSED_COUNT)) && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="flex h-11 items-center justify-center gap-1.5 rounded-[16px] text-[13.5px] font-medium text-muted-foreground ring-1 ring-(--hairline) transition-[color,background-color,transform] duration-150 hover:bg-card-hover hover:text-foreground active:scale-[0.98]"
        >
          {expanded ? "Mostrar menos" : `Mostrar mais ${hiddenCount}`}
          <ChevronDown
            className={cn("size-4 transition-transform duration-200", expanded && "rotate-180")}
            aria-hidden="true"
          />
        </button>
      )}

      <UndoToast
        toast={toast && { id: toast.id, text: toast.text, hasUndo: Boolean(toast.undo) }}
        onUndo={undo}
        undoing={undoing}
      />
    </div>
  );
}

function ReminderCard({
  reminder,
  confirmed,
  onPaid,
  onPartial,
  onDeferred,
}: {
  reminder: HomeReminder;
  confirmed: boolean;
  onPaid: (undo: () => Promise<void>) => void;
  onPartial: (undo: () => Promise<void>) => void;
  onDeferred: () => void;
}) {
  const isIncome = reminder.kind === "income";
  const overdue = !isIncome && reminder.overdue;
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
          isIncome
            ? "bg-positive/12 text-positive"
            : overdue
              ? "bg-negative/12 text-negative"
              : "bg-muted text-primary",
        )}
      >
        {isIncome ? (
          <ArrowDownLeft className="size-[18px]" aria-hidden="true" />
        ) : overdue ? (
          <AlertTriangle className="size-[18px]" aria-hidden="true" />
        ) : (
          <CalendarClock className="size-[18px]" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{reminder.label}</p>
        {/* Sem `truncate`: quebrar numa segunda linha preserva a data, que era
            o que o "…" comia. Cada parte inteira numa linha só — a quebra cai
            entre o valor e a data, nunca no meio de "10 de ago.". */}
        <p className="text-[13px] text-muted-foreground tabular-nums">
          {reminder.detail.split(" · ").map((part, i) => (
            <span key={i}>
              {i > 0 && " · "}
              <span
                className={cn(
                  part.length <= 24 && "whitespace-nowrap",
                  overdue && part.startsWith("venceu") && "text-negative",
                )}
              >
                {part}
              </span>
            </span>
          ))}
        </p>
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
            allowPartial={reminder.allowPartial}
            paidSoFar={reminder.paidSoFar}
            trigger={payTrigger}
            onDone={({ paymentId, settled }) =>
              (settled ? onPaid : onPartial)(() => unmarkExpensePayment(paymentId))
            }
          />
        )}
      </div>
    </div>
  );
}
