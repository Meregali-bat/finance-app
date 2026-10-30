"use client";

import { unwrap } from "@/lib/action-result";
import { useRef, useState, useTransition } from "react";
import { PiggyBank } from "lucide-react";
import { StatLabel } from "@/components/page-header";
import { CountUpCurrency } from "@/components/ui/animated-number";
import { JarDepositDialog } from "@/components/forms/jar-deposit-dialog";
import { JarYieldDialog } from "@/components/forms/jar-yield-dialog";
import { JarScheduleDialog } from "@/components/forms/jar-schedule-dialog";
import {
  dayFromKey,
  shortDay,
  type LotView,
  type YieldContext,
} from "@/components/jar-yield-preview";
import { DeleteIconButton } from "@/components/delete-icon-button";
import { UndoToast, type UndoToastState } from "@/components/undo-toast";
import {
  cancelJarReturn,
  deleteJar,
  restoreJarReturn,
  undoJarDeposit,
} from "@/lib/actions/jar";
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

/** O que tem data de volta e ainda não venceu: a Início e a Previsão já contam com ele. */
const committedOf = (jar: JarView) =>
  jar.returns.filter((r) => !r.overdue).reduce((sum, r) => sum + r.amount, 0);

/** O guardado que não tem data de volta nenhuma: o que dá para agendar. */
const unscheduledOf = (jar: JarView) =>
  Math.max(0, Math.round((jar.balance - jar.returns.reduce((sum, r) => sum + r.amount, 0)) * 100) / 100);

/**
 * As entradas que ainda não têm data de volta: as datas pegam primeiro as
 * mais antigas, e o que sobra é o que entrou por último. É delas que um novo
 * agendamento conta o rendimento e o IOF.
 */
function freeLots(jar: JarView): LotView[] {
  let scheduled = jar.returns.reduce((sum, r) => sum + r.amount, 0);
  const free: LotView[] = [];
  for (const lot of [...jar.lots].sort((a, b) => a.from.localeCompare(b.from))) {
    const take = Math.min(scheduled, lot.amount);
    scheduled -= take;
    if (lot.amount - take >= 0.005) free.push({ from: lot.from, amount: lot.amount - take });
  }
  return free;
}

/**
 * As caixinhas em grade, com o total guardado em cima. Guardar e resgatar
 * fazem o saldo e o total contarem até o valor novo (eles vêm revalidados do
 * servidor) e abrem um toast com "Desfazer".
 */
export function JarsGrid({ jars, yieldContext }: { jars: JarView[]; yieldContext: YieldContext }) {
  // Um toast só, para guardar, resgatar e tirar uma data: cada um leva o
  // próprio "Desfazer".
  const [toast, setToast] = useState<
    (NonNullable<UndoToastState> & { undo: () => Promise<unknown> }) | null
  >(null);
  const [undoing, startUndo] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Uma chave nova por toast, para um segundo aviso substituir o primeiro com
  // a animação de entrada em vez de só trocar o texto.
  const seq = useRef(0);
  // Como o banco mostra: com rendimento, o que a caixinha vale hoje.
  const total = jars.reduce((sum, jar) => sum + (jar.now?.total ?? jar.balance), 0);
  const earned = jars.reduce((sum, jar) => sum + (jar.now ? jar.now.total - jar.balance : 0), 0);
  // O que já tem data de volta está no número do dia; só o resto é folga.
  const committed = jars.reduce((sum, jar) => sum + committedOf(jar), 0);
  const saved = jars.reduce((sum, jar) => sum + jar.balance, 0);
  const free = Math.max(0, saved - committed);
  const estimated = yieldContext.cdiSource === "estimate";

  function done(jar: JarView, withdraw: boolean, depositId: string, amount: number) {
    setError(null);
    setToast({
      id: ++seq.current,
      hasUndo: true,
      text: `${formatCurrency(amount)} ${withdraw ? "resgatados de" : "guardados em"} ${jar.name}`,
      undo: () => undoJarDeposit(depositId),
    });
  }

  function scheduled(jar: JarView, plan: { planId: string; amount: number; date: string }) {
    setError(null);
    setToast({
      id: ++seq.current,
      hasUndo: true,
      text: `${formatCurrency(plan.amount)} de ${jar.name} volta em ${shortDay(dayFromKey(plan.date))}, já na Previsão`,
      undo: () => cancelJarReturn({ kind: "schedule", id: plan.planId }),
    });
  }

  function cancel(jar: JarView, r: JarView["returns"][number]) {
    setError(null);
    startUndo(async () => {
      try {
        const cancelled = await cancelJarReturn(r.source);
        if (!cancelled) return;
        setToast({
          id: ++seq.current,
          hasUndo: true,
          // O efeito, e não só o fato: sem a data, esse dinheiro sai do número do dia.
          text: `Sem data: ${formatCurrency(r.amount)} de ${jar.name} saiu da Previsão`,
          undo: async () => unwrap(await restoreJarReturn(cancelled)),
        });
      } catch (e) {
        setError(errorMessage(e, "Não deu para cancelar"));
      }
    });
  }

  function undo() {
    if (!toast) return;
    const { undo: revert } = toast;
    setToast(null);
    startUndo(async () => {
      try {
        await revert();
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
        {/* "Guardado" é sempre o que entrou; o número grande é o valor de
            hoje, com o rendimento. A linha de baixo fecha a soma. */}
        <StatLabel>{earned > 0.005 ? "Valor hoje" : "Total guardado"}</StatLabel>
        <CountUpCurrency
          value={total}
          className="font-heading text-[40px] leading-none font-bold tracking-[-0.045em] tabular-nums"
        />
        {/* Com uma caixinha só, o card já diz o rendimento: repetir aqui
            punha cada número duas vezes na tela. */}
        {earned > 0.005 && jars.length > 1 && (
          <p className="text-[13px] text-muted-foreground tabular-nums">
            {formatCurrency(saved)} guardado +{" "}
            <span className="font-medium text-positive">{formatCurrency(earned)}</span> de
            rendimento{estimated ? " (CDI estimado)" : ""}
          </p>
        )}
        {/* O que é folga e o que já está prometido: a Previsão manda resgatar
            quando falta, e o dinheiro com data de volta já está nessa conta. */}
        {/* Duas casas, e não uma frase de três linhas: "livre" é o mesmo nome
            que o card usa; "já na Previsão" fica nas linhas de cada volta. */}
        {committed >= 0.005 && (
          <dl className="mt-1.5 flex gap-6 tabular-nums">
            <div>
              <dt>
                <StatLabel>Livre</StatLabel>
              </dt>
              <dd className="text-[15px] font-semibold">{formatCurrency(free)}</dd>
            </div>
            <div>
              <dt>
                <StatLabel>Com data de volta</StatLabel>
              </dt>
              <dd className="text-[15px] font-semibold">{formatCurrency(committed)}</dd>
            </div>
          </dl>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}

      {/* Cards de pelo menos 340px: em quatro colunas de 230px, as linhas de
          volta e de rendimento quebravam em três. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(340px,1fr))] lg:gap-4">
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
                itemLabel={jar.name}
                // Com saldo, a exclusão é recusada: dizer antes, e não depois
                // de confirmar.
                disabledReason={
                  jar.balance >= 0.005 ? "Resgate o saldo para excluir a caixinha" : undefined
                }
                confirmMessage={`Excluir a caixinha "${jar.name}"? Os depósitos continuam no Histórico.`}
                className="-mt-1 -mr-1 size-9 lg:size-9"
              />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{jar.name}</p>
              <CountUpCurrency
                value={jar.now?.total ?? jar.balance}
                className={cn(
                  "block truncate font-heading text-[22px] leading-tight font-bold tracking-[-0.035em] tabular-nums",
                )}
              />
              {jar.now && (
                // O número grande é o valor de hoje, com o rendimento; embaixo,
                // o que sai de fato num resgate agora, já sem IOF e IR. Uma
                // linha só: quatro valores parecidos lado a lado confundiam.
                <p className="text-[12.5px] text-muted-foreground tabular-nums">
                  rendeu{" "}
                  <span className="text-positive">
                    +{formatCurrency(jar.now.total - jar.balance)}
                  </span>{" "}
                  · se resgatar hoje,{" "}
                  <b className="font-semibold text-foreground">{formatCurrency(jar.now.net)}</b>{" "}
                  líquido
                </p>
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
                      {/* O guardado é o que a Previsão conta; o rendimento até lá
                          é um extra que ela deixa de fora, e fica na dica. */}
                      {r.overdue
                        ? `${formatCurrency(r.amount)} era para voltar em ${shortDay(dayFromKey(r.date))}: resgate para contar`
                        : `${formatCurrency(r.amount)} volta em ${shortDay(dayFromKey(r.date))}, já na Previsão`}
                      {/* Na linha, e não numa dica: no celular a dica não aparece. */}
                      {!r.overdue && r.withYield != null && r.withYield - r.amount >= 0.005 && (
                        <span className="block">
                          com o rendimento até lá,{" "}
                          <span className="text-positive">{formatCurrency(r.withYield)}</span> líquido
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => cancel(jar, r)}
                      disabled={undoing}
                      aria-label={`Tirar a data de volta de ${formatCurrency(r.amount)}`}
                      // Palavra, e não um X: ao lado de dinheiro, o X parecia
                      // apagar o dinheiro.
                      className="-mr-1 h-9 shrink-0 rounded-lg px-1.5 text-[12px] font-medium text-muted-foreground underline decoration-border underline-offset-2 transition-colors duration-150 hover:text-foreground hover:decoration-current"
                    >
                      tirar data
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {jar.returns.length > 0 && unscheduledOf(jar) >= 0.005 && (
              <p className="-mt-2 text-[12.5px] text-muted-foreground tabular-nums">
                {formatCurrency(unscheduledOf(jar))} livre
              </p>
            )}
            {/* Lado a lado quando cabe: no card largo do celular, uma embaixo da
                outra só alongava a caixinha. */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              {unscheduledOf(jar) >= 0.005 && (
                <JarScheduleDialog
                  jarId={jar.id}
                  jarName={jar.name}
                  available={unscheduledOf(jar)}
                  lots={freeLots(jar)}
                  cdiPercent={jar.cdiPercent}
                  context={yieldContext}
                  onDone={(plan) => scheduled(jar, plan)}
                />
              )}
              {/* A simulação usa o que fica, porque o que tem data sai antes.
                  Quando quase tudo tem data, simular os centavos livres não
                  dizia nada: aí simula o guardado inteiro. */}
              <JarYieldDialog
                jarId={jar.id}
                jarName={jar.name}
                lots={unscheduledOf(jar) >= jar.balance * 0.05 ? freeLots(jar) : jar.lots}
                leaving={
                  unscheduledOf(jar) >= jar.balance * 0.05
                    ? jar.returns.filter((r) => !r.overdue)
                    : []
                }
                cdiPercent={jar.cdiPercent}
                context={yieldContext}
                onSaved={(percent) =>
                  setToast({
                    id: ++seq.current,
                    hasUndo: false,
                    text: percent
                      ? `${jar.name} rende ${percent}% do CDI`
                      : `${jar.name} sem rendimento`,
                    undo: async () => {},
                  })
                }
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
                holding={{
                  balance: jar.balance,
                  net: jar.now?.net ?? null,
                  returns: jar.returns.filter((r) => !r.overdue),
                }}
                disabled={jar.balance <= 0}
                onDone={({ depositId, amount }) => done(jar, true, depositId, amount)}
              />
            </div>
          </div>
        ))}
      </div>

      <UndoToast
        toast={toast}
        onUndo={undo}
        onDismiss={() => setToast(null)}
        undoing={undoing}
      />
    </>
  );
}
