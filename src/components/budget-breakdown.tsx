import { ChevronDown } from "lucide-react";
import type { PeriodBudget } from "@/lib/period";
import { formatCurrency } from "@/lib/format";

type Line = { label: string; amount: number; kind: "start" | "step" | "total" | "divide" };

/** Abaixo de meio centavo a linha não diz nada: some. */
const shows = (amount: number) => Math.abs(amount) >= 0.005;

/**
 * As linhas da conta, só com valores que o orçamento já tem.
 *
 * Com o saldo em conta, o período parte do dinheiro real (`periodBalance =
 * saldo − o que ainda sai + o que ainda entra`): as contas e faturas em aberto
 * são os lembretes, e o resto — lançamentos com data futura, recebimentos e
 * resgates por vir — é a diferença, que fecha a conta por construção. Sem o
 * saldo, é a corrente do período: `herança + renda − contas − faturas −
 * lançamentos − guardado + resgates`.
 *
 * Depois, o que o número do dia deixa de lado — a reserva de um ciclo à frente
 * e o que as fatias separam para guardar — e a divisão pelos dias. Se essa
 * segunda parte não bater com o número mostrado (não deveria acontecer), ela
 * fica de fora em vez de mostrar uma conta errada.
 */
function breakdownLines({
  budget,
  accountBalance,
  reservedForLater,
  savingsApplied,
  dailyAvailable,
}: BudgetBreakdownProps): Line[] {
  const lines: Line[] = [];

  if (budget.openingSource === "account" && accountBalance != null) {
    const toPay =
      budget.fixedExpenseReminders.reduce((sum, r) => sum + r.amount, 0) +
      budget.cardBillReminders.reduce((sum, r) => sum + r.amount, 0);
    const scheduled = budget.periodBalance - accountBalance + toPay;
    lines.push({ label: "Saldo em conta", amount: accountBalance, kind: "start" });
    if (shows(toPay))
      lines.push({ label: "Contas e faturas a pagar", amount: -toPay, kind: "step" });
    if (shows(scheduled))
      lines.push({
        label: scheduled > 0 ? "Entradas ainda previstas" : "Lançamentos agendados",
        amount: scheduled,
        kind: "step",
      });
  } else {
    // Sem herança (o primeiro período acompanhado), a conta começa na renda.
    if (shows(budget.openingBalance))
      lines.push({
        label:
          budget.openingBalance < 0
            ? "Faltou nos períodos anteriores"
            : "Sobra dos períodos anteriores",
        amount: budget.openingBalance,
        kind: "start",
      });
    const steps: [string, number][] = [
      ["Renda recebida", budget.incomeTotal],
      ["Contas fixas", -budget.fixedExpenseTotal],
      ["Faturas do cartão", -budget.cardBillTotal],
      ["Lançamentos na conta", -budget.transactionTotal],
      ["Guardado nas caixinhas", -budget.jarDepositTotal],
      ["Resgates das caixinhas", budget.jarReturnTotal],
    ];
    for (const [label, amount] of steps)
      if (shows(amount)) lines.push({ label, amount, kind: "step" });
  }

  lines.push({ label: "Livre até receber", amount: budget.periodBalance, kind: "total" });

  const days = budget.daysRemaining;
  const spendable = dailyAvailable * days;
  const reconciles =
    Math.abs(budget.periodBalance - reservedForLater - savingsApplied - spendable) < 0.01;
  if (!reconciles) return lines;

  if (shows(reservedForLater))
    lines.push({ label: "Reservado para depois", amount: -reservedForLater, kind: "step" });
  if (shows(savingsApplied))
    lines.push({ label: "Separado para guardar", amount: -savingsApplied, kind: "step" });
  if (shows(reservedForLater) || shows(savingsApplied))
    lines.push({ label: "Para gastar até receber", amount: spendable, kind: "total" });
  lines.push({
    label: `÷ ${days} ${days === 1 ? "dia" : "dias"}`,
    amount: dailyAvailable,
    kind: "divide",
  });
  return lines;
}

/** "+ R$ 10,00" e "− R$ 10,00": o sinal na frente, como numa conta armada. */
function signed(amount: number) {
  return `${amount < 0 ? "−" : "+"} ${formatCurrency(Math.abs(amount))}`;
}

type BudgetBreakdownProps = {
  budget: PeriodBudget;
  accountBalance: number | null;
  reservedForLater: number;
  savingsApplied: number;
  dailyAvailable: number;
};

/**
 * "Como chegamos nesse número": a conta do número do dia, aberta só quando a
 * pessoa pede. Um `<details>` nativo — teclado, leitor de tela e sem JS. O
 * resumo tem 44px de toque, e a margem negativa devolve o espaço: na tela ele
 * ocupa o mesmo que antes.
 */
export function BudgetBreakdown(props: BudgetBreakdownProps) {
  const lines = breakdownLines(props);
  return (
    <details className="group/why text-[13px] text-(--hero-muted)">
      <summary className="-mx-1 flex w-fit cursor-pointer list-none items-center gap-1 -my-2.5 min-h-11 rounded-sm px-1 font-medium transition-colors duration-150 select-none hover:text-(--hero-fg) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--hero-fg) [&::-webkit-details-marker]:hidden">
        Como chegamos nesse número
        <ChevronDown
          aria-hidden="true"
          className="size-3.5 shrink-0 transition-transform duration-150 group-open/why:rotate-180"
        />
      </summary>
      <dl className="mt-2 flex flex-col tabular-nums">
        {lines.map((line) => (
          <div
            key={line.label}
            className={
              line.kind === "step" || line.kind === "start"
                ? "flex justify-between gap-3 py-0.5"
                : "mt-1 mb-1 flex justify-between gap-3 border-t border-(--hero-line) pt-1.5 font-semibold text-(--hero-fg)"
            }
          >
            <dt className="min-w-0">{line.kind === "divide" ? `Por dia (${line.label})` : line.label}</dt>
            <dd className="shrink-0 text-right">
              {line.kind === "step" ? signed(line.amount) : formatCurrency(line.amount)}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
