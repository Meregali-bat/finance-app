import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { IncomeStep, BalanceStep, ExpensesStep, CardStep, StepHeader } from "./steps";

const TOTAL_STEPS = 4;

/**
 * O passo a passo do primeiro uso. Cada passo grava na hora, então quem sai no
 * meio volta para onde parou; o passo vem da URL (?passo=2), e sem ele a
 * pessoa cai no primeiro que falta.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ passo?: string }>;
}) {
  const userId = await requireUserId();
  const [user, incomes, adjustment, expenses, cards] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { onboardedAt: true } }),
    prisma.income.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: "asc" },
    }),
    prisma.balanceAdjustment.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.fixedExpense.findMany({
      where: { userId, deletedAt: null, cardId: null },
      orderBy: { createdAt: "asc" },
    }),
    prisma.creditCard.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  // Quem já terminou não refaz o passo a passo.
  if (user?.onboardedAt) redirect("/");

  const { passo } = await searchParams;
  const requested = Number(passo);
  // Sem renda, só o primeiro passo existe: os outros dependem do período.
  const step =
    incomes.length === 0
      ? 1
      : Number.isInteger(requested) && requested >= 1 && requested <= TOTAL_STEPS
        ? requested
        : 2;

  return (
    <main className="flex flex-col gap-7">
      <StepHeader step={step} total={TOTAL_STEPS} />
      {step === 1 && (
        <IncomeStep
          incomes={incomes.map((i) => ({
            id: i.id,
            label: i.label,
            amount: Number(i.amount),
            dayOfMonth: i.dayOfMonth,
          }))}
        />
      )}
      {step === 2 && <BalanceStep current={adjustment ? Number(adjustment.balance) : null} />}
      {step === 3 && (
        <ExpensesStep
          expenses={expenses.map((e) => ({
            id: e.id,
            label: e.label,
            amount: Number(e.amount),
            dueDay: e.dueDay,
          }))}
        />
      )}
      {step === 4 && (
        <CardStep
          cards={cards.map((c) => ({
            id: c.id,
            name: c.name,
            closingDay: c.closingDay,
            dueDay: c.dueDay,
          }))}
        />
      )}
    </main>
  );
}
