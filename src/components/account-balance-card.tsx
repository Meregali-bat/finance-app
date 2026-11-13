import { CircleAlert, Wallet } from "lucide-react";
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
  variant = "default",
}: {
  id?: string;
  balance: number | null;
  adjustedAt: Date | null;
  registeredMovement: number;
  today: Date;
  className?: string;
  style?: React.CSSProperties;
  /** "kpi": o card da fileira de números do desktop, com ícone e número menor. */
  variant?: "default" | "kpi";
}) {
  const kpi = variant === "kpi";
  // Uma semana depois do ajuste, o saldo já soma muita coisa que pode não ter
  // passado pelo app (tarifa, Pix recebido): ele deixa de ser mostrado como
  // fato e passa a pedir conferência com o extrato.
  const staleDays = balance != null && adjustedAt ? staleAdjustmentDays(adjustedAt, today) : null;
  return (
    <div
      id={id}
      className={homeCard(
        cn(
          "flex justify-between gap-4",
          kpi ? "items-start gap-3 lg:p-5" : "items-center",
          className,
        ),
      )}
      style={style}
    >
      {kpi && (
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/14 text-primary"
        >
          <Wallet className="size-5" />
        </span>
      )}
      <div className={cn("flex min-w-0 flex-col gap-1.5", kpi && "flex-1")}>
        {/* Um título com cara de rótulo: é o número de que o do dia parte, e
            precisa aparecer na navegação por títulos do leitor de tela. */}
        <h2 className="text-[12.5px] font-medium text-muted-foreground">
          {staleDays != null ? "Saldo estimado" : "Saldo em conta"}
        </h2>
        {balance == null ? (
          <p className="text-sm text-muted-foreground">
            {kpi
              ? "Informe o saldo da conta no lápis."
              : "Informe o saldo da sua conta para acompanhar quanto você tem agora."}
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
              className={`font-heading text-[22px] leading-none font-bold tracking-[-0.035em] tabular-nums ${kpi ? "lg:text-[24px]" : "lg:text-[32px]"} ${
                balance < 0 ? "text-negative" : staleDays != null ? "text-foreground/70" : ""
              }`}
            />
            {/* O ícone e o peso, não só a cor: o app não tem um tom de aviso,
                e o vermelho é do número que faltou. */}
            {staleDays != null ? (
              <p className="flex items-start gap-1 text-xs text-muted-foreground tabular-nums">
                <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0 text-foreground" />
                <span>
                  {/* Duas linhas, cada uma inteira: no card estreito, um "·"
                      no meio quebrava a frase de qualquer jeito. "Conferido"
                      é a palavra do hero e da conta para o mesmo momento. */}
                  <span className="block font-semibold text-balance text-foreground">Confira no app do banco</span>
                  <span className="block">Conferido há {staleDays} dias</span>
                </span>
              </p>
            ) : adjustedAt && (
              <p className="text-xs text-muted-foreground">
                Conferido em {formatDate(adjustedAt)}
                {!kpi && " · atualizado pelos lançamentos"}
              </p>
            )}
          </>
        )}
      </div>
      <BalanceAdjustmentDialog
        currentBalance={balance}
        registeredMovement={registeredMovement}
        stale={staleDays != null}
        openOnHash={id}
        checkedAt={adjustedAt}
      />
    </div>
  );
}
