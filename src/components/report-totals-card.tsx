import { Card, CardContent } from "@/components/ui/card";
import { SectionLabel } from "@/components/page-header";
import { formatCurrency } from "@/lib/format";
import type { ReportTotals } from "@/lib/report-totals";
import { cn } from "@/lib/utils";

/**
 * Os quatro números do período. Empilhados dois a dois no celular; só no `xl`
 * viram uma faixa de quatro regiões separadas por divisores, como o card de
 * resumo da tela inicial.
 */
export function ReportTotalsCard({ totals }: { totals: ReportTotals }) {
  const figures = [
    { label: "Gasto", value: totals.spent, tone: "" },
    { label: "Recebido", value: totals.received, tone: "text-primary" },
    {
      label: "Saldo",
      value: totals.balance,
      tone: totals.balance < 0 ? "text-negative" : "text-primary",
    },
    { label: "Média diária", value: totals.dailyAverage, tone: "" },
  ];

  return (
    <Card variant="elevated">
      <CardContent className="grid grid-cols-2 gap-4 xl:grid-cols-4 xl:gap-0">
        {figures.map((figure, index) => (
          <div
            key={figure.label}
            className={cn(
              "flex flex-col gap-1",
              // O divisor só faz sentido entre colunas vizinhas, então ele
              // pula a primeira de cada linha.
              index % 2 === 1 && "border-l border-border/60 pl-4",
              "xl:border-l xl:border-border/60 xl:pl-6",
              index === 0 && "xl:border-l-0 xl:pl-0",
            )}
          >
            <SectionLabel>{figure.label}</SectionLabel>
            <p className={cn("font-heading text-lg font-semibold tabular-nums", figure.tone)}>
              {formatCurrency(figure.value)}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
