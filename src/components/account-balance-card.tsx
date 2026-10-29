import { formatDate } from "@/lib/format";
import { StatLabel } from "@/components/page-header";
import { CountUpCurrency } from "@/components/ui/animated-number";
import { BalanceAdjustmentDialog } from "@/components/forms/balance-adjustment-dialog";
import { homeCard } from "@/components/home-card";
import { cn } from "@/lib/utils";

/**
 * Sem nenhum ajuste o card não mostra número: um saldo derivado só das
 * movimentações do app seria uma variação, não um saldo, e exibi-lo como se
 * fosse o do banco seria mentir com precisão de centavos.
 */
export function AccountBalanceCard({
  balance,
  adjustedAt,
  registeredMovement,
  className,
  style,
}: {
  balance: number | null;
  adjustedAt: Date | null;
  registeredMovement: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={homeCard(cn("flex items-center justify-between gap-4", className))} style={style}>
      <div className="flex min-w-0 flex-col gap-1.5">
        <StatLabel>Saldo em conta</StatLabel>
        {balance == null ? (
          <p className="text-sm text-muted-foreground">
            Informe o saldo da sua conta para acompanhar quanto você tem agora.
          </p>
        ) : (
          <>
            {/* Conta de novo a cada mudança: depois de pagar um lembrete, o
                saldo anda até o valor novo em vez de trocar de repente. */}
            <CountUpCurrency
              value={balance}
              memoryKey="account-balance"
              className={`font-heading text-[28px] leading-none font-bold tracking-[-0.035em] tabular-nums lg:text-[32px] ${
                balance < 0 ? "text-negative" : ""
              }`}
            />
            {adjustedAt && (
              <p className="text-xs text-muted-foreground">
                Ajustado em {formatDate(adjustedAt)}
                <span className="hidden sm:inline"> · atualizado pelos lançamentos</span>
              </p>
            )}
          </>
        )}
      </div>
      <BalanceAdjustmentDialog currentBalance={balance} registeredMovement={registeredMovement} />
    </div>
  );
}
