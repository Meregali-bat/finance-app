import { Card, CardContent } from "@/components/ui/card";
import { SectionLabel } from "@/components/page-header";
import { formatCurrency, formatDate } from "@/lib/format";
import { BalanceAdjustmentDialog } from "@/components/forms/balance-adjustment-dialog";

/**
 * Sem nenhum ajuste o card não mostra número: um saldo derivado só das
 * movimentações do app seria uma variação, não um saldo, e exibi-lo como se
 * fosse o do banco seria mentir com precisão de centavos.
 */
export function AccountBalanceCard({
  balance,
  adjustedAt,
  registeredMovement,
}: {
  balance: number | null;
  adjustedAt: Date | null;
  registeredMovement: number;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <SectionLabel>Saldo em conta</SectionLabel>
          {balance == null ? (
            <p className="text-sm text-muted-foreground">
              Informe o saldo da sua conta para acompanhar quanto você tem agora.
            </p>
          ) : (
            <>
              <p
                className={`font-heading text-3xl leading-tight font-semibold tracking-[-0.02em] tabular-nums ${
                  balance < 0 ? "text-negative" : ""
                }`}
              >
                {formatCurrency(balance)}
              </p>
              {adjustedAt && (
                <p className="text-xs text-muted-foreground">
                  Ajustado em {formatDate(adjustedAt)} · atualizado pelos seus lançamentos
                </p>
              )}
            </>
          )}
        </div>
        <div className="shrink-0 [&>button]:w-full sm:[&>button]:w-auto">
          <BalanceAdjustmentDialog
            hasBalance={balance != null}
            currentBalance={balance}
            registeredMovement={registeredMovement}
          />
        </div>
      </CardContent>
    </Card>
  );
}
