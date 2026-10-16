"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { PiggyBank } from "lucide-react";
import { SectionLabel } from "@/components/page-header";
import { CountUpCurrency } from "@/components/ui/animated-number";
import { JarDepositDialog } from "@/components/forms/jar-deposit-dialog";
import { DeleteIconButton } from "@/components/delete-icon-button";
import { UndoToast, type UndoToastState } from "@/components/undo-toast";
import { deleteJar, undoJarDeposit } from "@/lib/actions/jar";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export type JarView = { id: string; name: string; balance: number };

const TOAST_MS = 4000;

/**
 * As caixinhas em grade, com o total guardado em cima. Guardar e resgatar
 * fazem o saldo e o total contarem até o valor novo (eles vêm revalidados do
 * servidor) e abrem um toast com "Desfazer".
 */
export function JarsGrid({ jars }: { jars: JarView[] }) {
  const [toast, setToast] = useState<(UndoToastState & { depositId: string }) | null>(null);
  const [undoing, startUndo] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Uma chave nova por toast, para um segundo aviso substituir o primeiro com
  // a animação de entrada em vez de só trocar o texto.
  const seq = useRef(0);
  const total = jars.reduce((sum, jar) => sum + jar.balance, 0);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(t);
  }, [toast]);

  function done(jar: JarView, withdraw: boolean, depositId: string, amount: number) {
    setError(null);
    setToast({
      id: ++seq.current,
      depositId,
      hasUndo: true,
      text: `${formatCurrency(amount)} ${withdraw ? "resgatados de" : "guardados em"} ${jar.name}`,
    });
  }

  function undo() {
    if (!toast) return;
    const { depositId } = toast;
    setToast(null);
    startUndo(async () => {
      try {
        await undoJarDeposit(depositId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não deu para desfazer");
      }
    });
  }

  return (
    <>
      <div
        className="rise-in flex flex-col gap-1"
        style={{ "--rise-delay": "60ms" } as React.CSSProperties}
      >
        <SectionLabel>Total guardado</SectionLabel>
        <CountUpCurrency
          value={total}
          duration={1.2}
          delay={0.2}
          className="font-heading text-[40px] leading-none font-bold tracking-[-0.045em] tabular-nums"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4">
        {jars.map((jar, index) => (
          <div
            key={jar.id}
            className="pop-in flex min-w-0 flex-col gap-3 rounded-[20px] bg-card p-3.5 shadow-(--shadow-card) lg:p-4"
            style={{ "--rise-delay": `${120 + index * 70}ms` } as React.CSSProperties}
          >
            <div className="flex items-start justify-between gap-2">
              <span
                aria-hidden="true"
                className="flex size-[34px] items-center justify-center rounded-[11px] bg-primary/12 text-primary"
              >
                <PiggyBank className="size-[18px]" />
              </span>
              <DeleteIconButton
                action={deleteJar.bind(null, jar.id)}
                confirmMessage={`Excluir a caixinha "${jar.name}"? Os depósitos continuam no Histórico.`}
                className="-mt-1 -mr-1 size-9 lg:size-9"
              />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{jar.name}</p>
              <CountUpCurrency
                value={jar.balance}
                duration={1}
                delay={0.3 + index * 0.07}
                className={cn(
                  "block truncate font-heading text-[22px] leading-tight font-bold tracking-[-0.035em] tabular-nums",
                )}
              />
            </div>
            <div className="flex gap-2">
              <JarDepositDialog
                jarId={jar.id}
                jarName={jar.name}
                onDone={({ depositId, amount }) => done(jar, false, depositId, amount)}
              />
              {/* Sem saldo não há o que resgatar: o botão fica, apagado, para a
                  grade de botões não mudar de forma entre uma caixinha e outra. */}
              <JarDepositDialog
                jarId={jar.id}
                jarName={jar.name}
                mode="withdraw"
                disabled={jar.balance <= 0}
                onDone={({ depositId, amount }) => done(jar, true, depositId, amount)}
              />
            </div>
          </div>
        ))}
      </div>

      <UndoToast toast={toast} onUndo={undo} undoing={undoing} />
    </>
  );
}
