import { StatLabel } from "@/components/page-header";
import { formatCurrency, formatDate } from "@/lib/format";
import type { ReportTotals } from "@/lib/report-totals";
import { cn } from "@/lib/utils";

/** O saldo da conta numa ponta do período, a partir da leitura do extrato. */
export type PeriodAccount = {
  balance: number;
  /** "Saldo em conta" no período em curso; "Saldo em 30/09" num que já passou. */
  label: string;
  /** Quando o saldo foi conferido com o banco — o ponto de onde a conta parte. */
  checkedAt: Date;
};

/**
 * Os quatro números do período, num card elevado: 2×2 no celular, uma faixa
 * de quatro no `xl`. Os divisores são uma sombra de 1px no canto superior
 * esquerdo de cada célula, e o `overflow-hidden` corta o que cai na borda —
 * assim eles acertam sozinhos tanto na grade 2×2 quanto na faixa.
 *
 * Gasto e Recebido são só o que é seu: o emprestado, as devoluções e o
 * dinheiro entre contas suas ficam numa nota embaixo, para a conta fechar sem
 * inflar o mês. O saldo é o da conta, partindo do que foi conferido com o
 * banco — somar meses não diz quanto há lá.
 */
export function ReportTotalsCard({
  totals,
  account,
}: {
  totals: ReportTotals;
  /** Nulo quando o saldo nunca foi conferido: aí só o resultado do período. */
  account: PeriodAccount | null;
}) {
  const result = totals.received - totals.spent;
  const figures: { label: string; value: number; tone: string; notes: string[] }[] = [
    {
      label: "Gasto",
      value: totals.spent,
      tone: "",
      notes: [
        totals.lent >= 0.005 ? `fora ${formatCurrency(totals.lent)} emprestados` : "",
        totals.transferred >= 0.005
          ? `fora ${formatCurrency(totals.transferred)} para outra conta`
          : "",
      ],
    },
    {
      label: "Recebido",
      value: totals.received,
      tone: "text-positive",
      notes: [
        totals.repaid >= 0.005 ? `fora ${formatCurrency(totals.repaid)} devolvidos` : "",
        totals.transferred <= -0.005
          ? `fora ${formatCurrency(-totals.transferred)} de outra conta`
          : "",
      ],
    },
    account
      ? {
          label: account.label,
          value: account.balance,
          tone: account.balance < 0 ? "text-negative" : "text-positive",
          notes: [`a partir do conferido em ${formatDate(account.checkedAt)}`],
        }
      : {
          label: "Recebido − gasto",
          value: result,
          tone: result < 0 ? "text-negative" : "text-positive",
          notes: ["confira o saldo do banco na Início para ver o da conta"],
        },
    { label: "Média diária", value: totals.dailyAverage, tone: "", notes: [] },
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
            {figure.notes.filter(Boolean).map((note) => (
              <p key={note} className="text-xs text-muted-foreground tabular-nums">
                {note}
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
