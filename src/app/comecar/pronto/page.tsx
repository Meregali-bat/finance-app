import Link from "next/link";
import { redirect } from "next/navigation";
import { differenceInCalendarDays } from "date-fns";
import { requireUserId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { loadBudgetInputs } from "@/lib/budget-inputs";
import { todayBudget } from "@/lib/today-budget";
import { formatCurrency, formatDate } from "@/lib/format";
import { CountUpCurrency } from "@/components/ui/animated-number";

/**
 * O fim do primeiro uso: o número que o app existe para dar, calculado pela
 * mesma função da Início, e uma frase do que entrou na conta dele.
 */
export default async function OnboardingDonePage() {
  const userId = await requireUserId();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { onboardedAt: true },
  });
  if (!user?.onboardedAt) redirect("/comecar");

  const today = new Date();
  const inputs = await loadBudgetInputs(userId);
  const { budget, dailyAvailable, accountBalance } = todayBudget(inputs, today);
  const isOverBudget = dailyAvailable < 0;
  const days = Math.max(1, differenceInCalendarDays(budget.periodEnd, today));
  const expenses = inputs.fixedExpenses.filter((e) => !e.cardId).length;

  const counted = [
    inputs.incomes.length === 1 ? "sua renda" : `suas ${inputs.incomes.length} rendas`,
    expenses > 0 ? `${expenses} ${expenses === 1 ? "conta fixa" : "contas fixas"}` : null,
    accountBalance != null ? "o saldo da conta" : null,
  ].filter(Boolean) as string[];
  const countedText =
    counted.length > 1 ? `${counted.slice(0, -1).join(", ")} e ${counted.at(-1)}` : counted[0];

  return (
    <main className="flex flex-col gap-7">
      <section
        aria-label="Seu primeiro número"
        className="hero-surface rise-in relative overflow-hidden rounded-[26px] lg:rounded-[28px]"
      >
        <div className="relative z-10 flex flex-col gap-5 p-[22px] lg:p-8">
          <p className="text-sm font-medium text-(--hero-muted)">
            {isOverBudget ? "Hoje já está no vermelho" : "Por dia, até receber"}
          </p>
          <CountUpCurrency
            value={dailyAvailable}
            split
            reveal
            duration={1.4}
            delay={0.3}
            className={`flex items-baseline font-heading text-[64px] leading-[0.9] font-bold tracking-[-0.045em] tabular-nums lg:text-[80px] ${
              isOverBudget ? "text-negative" : "text-(--hero-fg)"
            }`}
            symbolClassName="mr-1.5 text-[24px] tracking-[-0.02em] opacity-70 lg:mr-2 lg:text-[30px]"
            centsClassName="text-[30px] tracking-[-0.03em] opacity-70 lg:text-[36px]"
          />
          <p className="text-[15px] leading-relaxed text-(--hero-muted)">
            {/* Fora do vermelho, o "por dia" já está no rótulo acima. */}
            {isOverBudget
              ? `Por dia, até ${formatDate(budget.periodEnd)} — ${days} ${days === 1 ? "dia" : "dias"} até o próximo pagamento.`
              : `Próximo pagamento em ${formatDate(budget.periodEnd)}, daqui a ${days} ${days === 1 ? "dia" : "dias"}.`}{" "}
            Já contando {countedText}
            {budget.periodBalance > 0
              ? `: ${formatCurrency(budget.periodBalance)} livres até receber.`
              : "."}
          </p>
        </div>
      </section>

      <div
        className="rise-in flex flex-col gap-3"
        style={{ "--rise-delay": "200ms" } as React.CSSProperties}
      >
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          O número muda conforme você lança gastos e confirma o que recebe e o que paga. Lance o
          primeiro pelo botão + da Início.
        </p>
        <Link
          href="/"
          className="cta-surface flex h-12 items-center justify-center rounded-[14px] text-[15px] font-semibold text-white transition-[transform,box-shadow] duration-150 ease-out-quint active:scale-[0.98]"
        >
          Ir para a Início
        </Link>
      </div>
    </main>
  );
}
