import { CircleAlert } from "lucide-react";
import { formatDate } from "@/lib/format";
import { staleAdjustmentDays } from "@/lib/account-balance";
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
  id,
  balance,
  adjustedAt,
  registeredMovement,
  today,
  className,
  style,
}: {
  id?: string;
  balance: number | null;
  adjustedAt: Date | null;
  registeredMovement: number;
  today: Date;
  className?: string;
  style?: React.CSSProperties;
}) {
  // Uma semana depois do ajuste, o saldo já soma muita coisa que pode não ter
  // passado pelo app (tarifa, Pix recebido): ele deixa de ser mostrado como
  // fato e passa a pedir conferência com o extrato.
  const staleDays = balance != null && adjustedAt ? staleAdjustmentDays(adjustedAt, today) : null;
  return (
    <div
      id={id}
      className={homeCard(cn("flex items-center justify-between gap-4", className))}
      style={style}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        {/* Um título com cara de rótulo: é o número de que o do dia parte, e
            precisa aparecer na navegação por títulos do leitor de tela. */}
        <h2 className="text-[12.5px] font-medium text-muted-foreground">Saldo em conta</h2>
        {balance == null ? (
          <p className="text-sm text-muted-foreground">
            Informe o saldo da sua conta para acompanhar quanto você tem agora.
          </p>
        ) : (
          <>
            {/* Conta de novo a cada mudança: depois de pagar um lembrete, o
                saldo anda até o valor novo em vez de trocar de repente. 22px
                no celular: logo abaixo do hero, maior que isso ele lê como um
                segundo número do dia. */}
            <CountUpCurrency
              value={balance}
              memoryKey="account-balance"
              className={`font-heading text-[22px] leading-none font-bold tracking-[-0.035em] tabular-nums lg:text-[32px] ${
                balance < 0 ? "text-negative" : ""
              }`}
            />
            {/* O ícone e o peso, não só a cor: o app não tem um tom de aviso,
                e o vermelho é do número que faltou. */}
            {staleDays != null ? (
              <p className="flex items-start gap-1 text-xs text-muted-foreground tabular-nums">
                <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0 text-foreground" />
                <span>
                  <span className="font-semibold text-foreground">Confira com o extrato</span> ·
                  ajustado há {staleDays} dias
                </span>
              </p>
            ) : adjustedAt && (
              <p className="text-xs text-muted-foreground">
                Ajustado em {formatDate(adjustedAt)}
                <span className="hidden sm:inline"> · atualizado pelos lançamentos</span>
              </p>
            )}
          </>
        )}
      </div>
      <BalanceAdjustmentDialog
        currentBalance={balance}
        registeredMovement={registeredMovement}
        stale={staleDays != null}
      />
    </div>
  );
}
