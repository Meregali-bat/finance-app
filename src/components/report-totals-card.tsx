import { StatLabel } from "@/components/page-header";
import { formatCurrency } from "@/lib/format";
import type { ReportTotals } from "@/lib/report-totals";
import { cn } from "@/lib/utils";

/**
 * Os quatro números do período, num card elevado: 2×2 no celular, uma faixa
 * de quatro no `xl`. Os divisores são uma sombra de 1px no canto superior
 * esquerdo de cada célula, e o `overflow-hidden` corta o que cai na borda —
 * assim eles acertam sozinhos tanto na grade 2×2 quanto na faixa.
 */
export function ReportTotalsCard({
  totals,
  carried = 0,
}: {
  totals: ReportTotals;
  /**
   * O que sobrou ou faltou dos períodos anteriores: o saldo o carrega, como o
   * resto do app — o que faltou num mês não some no outro.
   */
  carried?: number;
}) {
  const hasCarry = Math.abs(carried) >= 0.005;
  const balance = totals.balance + carried;
  const figures = [
    { label: "Gasto", value: totals.spent, tone: "" },
    { label: "Recebido", value: totals.received, tone: "text-positive" },
    {
      label: "Saldo",
      value: balance,
      tone: balance < 0 ? "text-negative" : "text-positive",
    },
    { label: "Média diária", value: totals.dailyAverage, tone: "" },
  ];

  return (
    <div
      className="rise-in overflow-hidden rounded-[20px] bg-muted shadow-(--shadow-card)"
      style={{ "--rise-delay": "80ms" } as React.CSSProperties}
    >
      <div className="grid grid-cols-2 overflow-hidden xl:grid-cols-4">
        {figures.map((figure) => (
          <div
            key={figure.label}
            className="flex flex-col gap-1 px-4 py-3.5 shadow-[-1px_-1px_0_0_var(--hairline)] lg:px-5 lg:py-4"
          >
            <StatLabel>{figure.label}</StatLabel>
            <p
              className={cn(
                "font-heading text-xl leading-tight font-bold tracking-[-0.03em] tabular-nums",
                figure.tone,
              )}
            >
              {formatCurrency(figure.value)}
            </p>
            {/* A caixinha não é gasto nem receita, mas sai do saldo: sem dizer
                isso, o saldo pareceria não bater com as duas colunas. */}
            {/* De onde vem o saldo: só o que veio dos anteriores, como parcela.
                A parte do período sai da conta, e com ela a nota passava de
                quatro linhas no celular. */}
            {/* As três partes do saldo, cada uma numa linha curta: o período,
                o que veio de antes e o que foi para as caixinhas. */}
            {figure.label === "Saldo" && (hasCarry || Math.abs(totals.saved) >= 0.005) && (
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatCurrency(totals.balance + totals.saved)} do período
              </p>
            )}
            {figure.label === "Saldo" && hasCarry && (
              <p className="text-xs text-muted-foreground tabular-nums">
                {carried < 0 ? "− " : "+ "}
                <span className={carried < 0 ? "text-negative" : undefined}>
                  {formatCurrency(Math.abs(carried))}
                </span>{" "}
                {carried < 0 ? "que faltou antes" : "que sobrou antes"}
              </p>
            )}
            {figure.label === "Saldo" && Math.abs(totals.saved) >= 0.005 && (
              <p className="text-xs text-muted-foreground tabular-nums">
                {totals.saved > 0
                  ? `− ${formatCurrency(totals.saved)} guardados`
                  : `+ ${formatCurrency(-totals.saved)} resgatados`}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
