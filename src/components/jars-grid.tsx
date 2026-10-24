"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { PiggyBank } from "lucide-react";
import { StatLabel } from "@/components/page-header";
import { CountUpCurrency } from "@/components/ui/animated-number";
import { JarDepositDialog } from "@/components/forms/jar-deposit-dialog";
import { JarYieldDialog } from "@/components/forms/jar-yield-dialog";
import { JarScheduleDialog } from "@/components/forms/jar-schedule-dialog";
import { X } from "lucide-react";
import {
  dayFromKey,
  shortDay,
  type LotView,
  type YieldContext,
} from "@/components/jar-yield-preview";
import { DeleteIconButton } from "@/components/delete-icon-button";
import { UndoToast, type UndoToastState } from "@/components/undo-toast";
import { cancelJarReturn, deleteJar, undoJarDeposit } from "@/lib/actions/jar";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/error-message";

export type JarView = {
  id: string;
  name: string;
  balance: number;
  cdiPercent: number | null;
  /** O saldo dividido pelas entradas que o formam, cada uma com a sua data. */
  lots: LotView[];
  /**
   * Quanto vale hoje, com a porcentagem do CDI informada: o guardado mais o
   * que rendeu (`total`) e o que sairia num resgate agora, sem IOF e IR (`net`).
   */
  now: { total: number; net: number } | null;
  /** O que foi guardado com data para voltar e ainda não voltou. */
  returns: {
    source: { kind: "deposit" | "schedule"; id: string };
    amount: number;
    date: string;
    overdue: boolean;
    /** O que volta no dia com o rendimento até lá, sem IOF e IR; nulo sem CDI. */
    withYield: number | null;
  }[];
};

const TOAST_MS = 4000;

/**
 * As caixinhas em grade, com o total guardado em cima. Guardar e resgatar
 * fazem o saldo e o total contarem até o valor novo (eles vêm revalidados do
 * servidor) e abrem um toast com "Desfazer".
 */
export function JarsGrid({ jars, yieldContext }: { jars: JarView[]; yieldContext: YieldContext }) {
  const [toast, setToast] = useState<(UndoToastState & { depositId: string }) | null>(null);
  const [undoing, startUndo] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Uma chave nova por toast, para um segundo aviso substituir o primeiro com
  // a animação de entrada em vez de só trocar o texto.
  const seq = useRef(0);
  // Como o banco mostra: com rendimento, o que a caixinha vale hoje.
  const total = jars.reduce((sum, jar) => sum + (jar.now?.total ?? jar.balance), 0);
  const earned = jars.reduce((sum, jar) => sum + (jar.now ? jar.now.total - jar.balance : 0), 0);
  const estimated = yieldContext.cdiSource === "estimate";

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

  function cancel(source: { kind: "deposit" | "schedule"; id: string }) {
    setError(null);
    startUndo(async () => {
      try {
        await cancelJarReturn(source);
      } catch (e) {
        setError(errorMessage(e, "Não deu para cancelar"));
      }
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
        setError(errorMessage(e, "Não deu para desfazer"));
      }
    });
  }

  return (
    <>
      <div
        className="rise-in flex flex-col gap-1"
        style={{ "--rise-delay": "60ms" } as React.CSSProperties}
      >
        <StatLabel>Total guardado</StatLabel>
        <CountUpCurrency
          value={total}
          duration={1.2}
          delay={0.2}
          className="font-heading text-[40px] leading-none font-bold tracking-[-0.045em] tabular-nums"
        />
        {earned > 0.005 && (
          <p className="text-[13px] text-muted-foreground tabular-nums">
            <span className="font-medium text-positive">+{formatCurrency(earned)}</span> de
            rendimento até hoje{estimated ? " (CDI estimado)" : ""}
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4">
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
                value={jar.now?.total ?? jar.balance}
                duration={1}
                delay={0.3 + index * 0.07}
                className={cn(
                  "block truncate font-heading text-[22px] leading-tight font-bold tracking-[-0.035em] tabular-nums",
                )}
              />
              {jar.now && (
                // Como o banco mostra: o que rendeu até hoje e o que sairia num
                // resgate agora, já sem IOF e IR. O número grande é o valor de hoje.
                <dl className="mt-1.5 grid grid-cols-2 gap-x-2 text-[12px] tabular-nums">
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">Rendeu</dt>
                    <dd className="truncate font-semibold text-positive">
                      +{formatCurrency(jar.now.total - jar.balance)}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">Saque líquido</dt>
                    <dd className="truncate font-semibold">{formatCurrency(jar.now.net)}</dd>
                  </div>
                </dl>
              )}
            </div>
            {jar.returns.length > 0 && (
              <ul className="-mt-1 flex flex-col text-[12.5px] tabular-nums">
                {jar.returns.map((r) => (
                  <li
                    key={`${r.source.kind}-${r.source.id}`}
                    className={cn(
                      "flex items-start justify-between gap-1",
                      r.overdue ? "text-negative" : "text-muted-foreground",
                    )}
                  >
                    <span className="min-w-0 pt-1.5">
                      {r.overdue
                        ? `${formatCurrency(r.amount)} era para voltar em ${shortDay(dayFromKey(r.date))}: resgate para contar`
                        : `${formatCurrency(r.amount)} volta em ${shortDay(dayFromKey(r.date))}`}
                      {r.withYield != null && r.withYield - r.amount >= 0.005 && (
                        <span className="block text-foreground">
                          {formatCurrency(r.withYield)} com o rendimento até lá
                          <span className="text-positive">
                            {" "}
                            (+{formatCurrency(r.withYield - r.amount)})
                          </span>
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => cancel(r.source)}
                      aria-label={`Cancelar a volta de ${formatCurrency(r.amount)}`}
                      title="Cancelar a data"
                      className="-mr-2 flex size-8 shrink-0 items-center justify-center rounded-full transition-colors duration-150 hover:bg-muted hover:text-foreground"
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {/* Lado a lado quando cabe: no card largo do celular, uma embaixo da
                outra só alongava a caixinha. */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              {jar.balance - jar.returns.reduce((sum, r) => sum + r.amount, 0) > 0.005 && (
                <JarScheduleDialog
                  jarId={jar.id}
                  jarName={jar.name}
                  available={
                    Math.round(
                      (jar.balance - jar.returns.reduce((sum, r) => sum + r.amount, 0)) * 100,
                    ) / 100
                  }
                  lots={jar.lots}
                  cdiPercent={jar.cdiPercent}
                  context={yieldContext}
                />
              )}
              <JarYieldDialog
                jarId={jar.id}
                jarName={jar.name}
                lots={jar.lots}
                cdiPercent={jar.cdiPercent}
                context={yieldContext}
              />
            </div>
            <div className="flex gap-2">
              <JarDepositDialog
                jarId={jar.id}
                jarName={jar.name}
                cdiPercent={jar.cdiPercent}
                yieldContext={yieldContext}
                onDone={({ depositId, amount }) => done(jar, false, depositId, amount)}
              />
              {/* Sem saldo não há o que resgatar: o botão fica, apagado, para a
                  grade de botões não mudar de forma entre uma caixinha e outra. */}
              <JarDepositDialog
                jarId={jar.id}
                jarName={jar.name}
                mode="withdraw"
                yieldContext={yieldContext}
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
