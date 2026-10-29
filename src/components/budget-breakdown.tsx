import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { PeriodBudget } from "@/lib/period";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Line = {
  label: string;
  amount: number;
  kind: "start" | "step" | "total" | "divide";
  /** O que fica de lado leva para onde ele é decidido: a previsão ou as metas. */
  href?: string;
  /** Um total que falta: o rótulo já diz, o valor vai sem sinal e em coral. */
  negative?: boolean;
};

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
 * fica de fora em vez de mostrar uma conta errada, e o que fica de lado vira
 * nota abaixo dela: no celular, a conta é o único lugar desses valores.
 */
function breakdownLines({
  budget,
  accountBalance,
  accountBalanceDate,
  reservedForLater,
  savingsApplied,
  dailyAvailable,
}: BudgetBreakdownProps): { lines: Line[]; reconciles: boolean } {
  const lines: Line[] = [];

  if (budget.openingSource === "account" && accountBalance != null) {
    const toPay =
      budget.fixedExpenseReminders.reduce((sum, r) => sum + r.amount, 0) +
      budget.cardBillReminders.reduce((sum, r) => sum + r.amount, 0);
    const scheduled = budget.periodBalance - accountBalance + toPay;
    // Com o saldo velho, a linha diz de quando ele é: o número parte dele.
    lines.push({
      label: accountBalanceDate
        ? `Saldo em conta (estimado; conferido em ${formatDate(accountBalanceDate)})`
        : "Saldo em conta",
      amount: accountBalance,
      kind: "start",
    });
    if (shows(toPay))
      lines.push({ label: "Contas e faturas a pagar", amount: -toPay, kind: "step" });
    if (shows(scheduled))
      lines.push({
        label: scheduled > 0 ? "Recebimentos e resgates por vir" : "Lançamentos com data futura",
        amount: scheduled,
        kind: "step",
        // A diferença que fecha a conta junta várias coisas (resgates,
        // recebimentos, lançamentos com data); a Previsão do ciclo atual lista
        // cada uma. Sem o link, é a linha que ninguém consegue conferir.
        href: "/previsao?p=0",
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

  // No vermelho, o rótulo diz o lado: "livre" negativo não é coisa que se lê.
  // O valor vai sem sinal, em coral, como no hero.
  const short = budget.periodBalance < -0.005;
  lines.push({
    label: short ? "Falta até receber" : "Livre até receber",
    amount: short ? -budget.periodBalance : budget.periodBalance,
    kind: "total",
    negative: short,
  });

  const days = budget.daysRemaining;
  const spendable = dailyAvailable * days;
  const reconciles =
    Math.abs(budget.periodBalance - reservedForLater - savingsApplied - spendable) < 0.01;
  if (!reconciles) return { lines, reconciles };

  if (shows(reservedForLater))
    lines.push({
      label: "Reservado para depois",
      amount: -reservedForLater,
      kind: "step",
      href: "/previsao",
    });
  if (shows(savingsApplied))
    lines.push({
      label: "Separado para guardar",
      amount: -savingsApplied,
      kind: "step",
      href: "/metas",
    });
  if (shows(reservedForLater) || shows(savingsApplied))
    lines.push({ label: "Para gastar até receber", amount: spendable, kind: "total" });
  lines.push({
    label: `÷ ${days} ${days === 1 ? "dia" : "dias"}`,
    amount: Math.abs(dailyAvailable),
    kind: "divide",
    negative: dailyAvailable < -0.005,
  });
  return { lines, reconciles };
}

/** "+ R$ 10,00" e "− R$ 10,00": o sinal na frente, como numa conta armada. */
function signed(amount: number) {
  return `${amount < 0 ? "−" : "+"} ${formatCurrency(Math.abs(amount))}`;
}
type BudgetBreakdownProps = {
  budget: PeriodBudget;
  accountBalance: number | null;
  /** A data do ajuste, só quando o saldo está velho (`staleAdjustmentDays`). */
  accountBalanceDate?: Date | null;
  reservedForLater: number;
  savingsApplied: number;
  dailyAvailable: number;
  /** O gasto do período (conta e cartão): o total da curva sob a régua. */
  spentInPeriod: number;
};

/** Os links de dentro da conta: sublinhados, para não lerem como texto solto. */
const lineLink =
  "group/line inline-flex items-center gap-0.5 rounded-sm underline decoration-(--hero-line) underline-offset-4 transition-colors duration-150 hover:text-(--hero-fg) hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--hero-fg)";

/**
 * "Como chegamos nesse número": a conta do número do dia. No celular, aberta
 * só quando a pessoa pede: um `<details>` nativo — teclado, leitor de tela e
 * sem JS. O resumo tem 44px de toque, e a margem negativa devolve o espaço: na
 * tela ele ocupa o mesmo que antes. No desktop, sempre aberta. Só uma das duas
 * existe por tamanho (a outra é `display: none`), então o leitor de tela lê a
 * conta uma vez.
 *
 * No celular, é aqui que ficam o reservado, o separado para guardar e o gasto
 * do período: o hero leva só o número, o já descontado e o livre até receber.
 */
export function BudgetBreakdown(props: BudgetBreakdownProps) {
  const { lines, reconciles } = breakdownLines(props);
  const { reservedForLater, savingsApplied, spentInPeriod } = props;
  // Sem a conta fechar, o que fica de lado não entra nas linhas, mas continua
  // dito, como nota.
  const asideNotes = reconciles
    ? []
    : [
        shows(reservedForLater)
          ? {
              text: `${formatCurrency(reservedForLater)} ficam reservados para depois`,
              href: "/previsao",
            }
          : null,
        shows(savingsApplied)
          ? {
              text: `${formatCurrency(savingsApplied)} ficam separados para guardar`,
              href: "/metas",
            }
          : null,
      ].filter((note) => note != null);
  const body = (
    <>
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
            <dt className="min-w-0">
              {line.href ? (
                <Link href={line.href} className={lineLink}>
                  {line.label}
                  <ChevronRight
                    aria-hidden="true"
                    className="size-3 shrink-0 transition-transform duration-150 group-hover/line:translate-x-0.5"
                  />
                </Link>
              ) : line.kind === "divide" ? (
                `${line.negative ? "Falta por dia" : "Por dia"} (${line.label})`
              ) : (
                line.label
              )}
            </dt>
            <dd className={cn("shrink-0 text-right", line.negative && "text-negative")}>
              {line.kind === "step" ? signed(line.amount) : formatCurrency(line.amount)}
            </dd>
          </div>
        ))}
      </dl>
      {asideNotes.map((note) => (
        <p key={note.href} className="mt-1 tabular-nums">
          <Link href={note.href} className={lineLink}>
            {note.text}
          </Link>
        </p>
      ))}
    </>
  );
  return (
    <>
      {/* No celular, aberta só quando pedida. */}
      <details className="group/why text-[13px] text-(--hero-muted) lg:hidden">
        <summary className="-mx-1 flex w-fit cursor-pointer list-none items-center gap-1 -my-2.5 min-h-11 rounded-sm px-1 font-medium transition-colors duration-150 select-none hover:text-(--hero-fg) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--hero-fg) [&::-webkit-details-marker]:hidden">
          Como chegamos nesse número
          <ChevronDown
            aria-hidden="true"
            className="size-3.5 shrink-0 transition-transform duration-150 group-open/why:rotate-180"
          />
        </summary>
        {body}
        {/* Fora da conta, e só no celular: no desktop ele fica sob a curva.
            Ele já está dentro das linhas acima (nos lançamentos, nas faturas
            ou no saldo), então vem como frase, não como mais uma parcela. */}
        {shows(spentInPeriod) && (
          <p className="mt-2 border-t border-dashed border-(--hero-line) pt-2 tabular-nums">
            Para comparar: você já gastou{" "}
            <span className="font-semibold text-(--hero-fg)">{formatCurrency(spentInPeriod)}</span>{" "}
            neste período, na conta e no cartão.
          </p>
        )}
      </details>
      {/* No desktop, aberta: a coluna da direita do hero existe para ela. */}
      <div className="hidden text-[13px] text-(--hero-muted) lg:block">
        <p className="text-[12.5px] font-medium">Como chegamos nesse número</p>
        {body}
      </div>
    </>
  );
}
