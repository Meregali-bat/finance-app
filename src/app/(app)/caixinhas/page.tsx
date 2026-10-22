import { PiggyBank } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/page-header";
import { JarFormDialog } from "@/components/forms/jar-form-dialog";
import { JarsGrid } from "@/components/jars-grid";
import { loadBudgetInputs } from "@/lib/budget-inputs";
import { todayBudget } from "@/lib/today-budget";
import { currentCdi } from "@/lib/cdi";
import { todayInputValue } from "@/lib/format";
import { remainingLots } from "@/lib/jar-yield";
import { jarReturns } from "@/lib/jar-plans";
import { forecastPeriods } from "@/lib/forecast";

/** O dia local de um instante como "YYYY-MM-DD". */
function dayKey(instant: Date) {
  return `${instant.getFullYear()}-${String(instant.getMonth() + 1).padStart(2, "0")}-${String(instant.getDate()).padStart(2, "0")}`;
}

/** O mesmo dia como meia-noite UTC, a forma que o cálculo de rendimento usa. */
function utcDay(instant: Date) {
  return new Date(Date.UTC(instant.getFullYear(), instant.getMonth(), instant.getDate()));
}

export default async function JarsPage() {
  const userId = await requireUserId();
  const [jars, inputs, cdi] = await Promise.all([
    prisma.jar.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      include: {
        deposits: {
          select: {
            amount: true,
            balanceChange: true,
            createdAt: true,
            plannedWithdrawalAt: true,
          },
        },
      },
    }),
    loadBudgetInputs(userId),
    currentCdi(),
  ]);
  const today = new Date();
  const { budget } = todayBudget(inputs, today);
  const nextPayday = inputs.incomes.length > 0 ? dayKey(budget.periodEnd) : null;

  // As próximas contas a pagar, deste ciclo e do seguinte: o dinheiro sai da
  // caixinha para pagar uma delas, e o dia dela é a data de tirar sugerida.
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const seen = new Set<string>();
  const upcomingBills = forecastPeriods({
    ...inputs,
    openingBalance: budget.openingBalance,
    today,
    count: 1,
  })
    .flatMap((period) => period.entries)
    .filter(
      (e) =>
        (e.kind === "fixedExpense" || e.kind === "cardBill") &&
        !e.confirmed &&
        e.date.getTime() >= todayStart.getTime(),
    )
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .filter((e) => {
      // Uma vez cada conta: a do mês que vem repete a deste.
      if (seen.has(e.label)) return false;
      seen.add(e.label);
      return true;
    })
    .slice(0, 5)
    .map((e) => ({ label: e.label, date: dayKey(e.date), amount: e.amount }));

  /**
   * As entradas que formam o saldo de cada caixinha, cada uma com a sua data:
   * o resgate sai das mais antigas. O que o saldo tem e os movimentos não
   * explicam (um saldo de antes do app) conta desde a criação da caixinha.
   */
  function lotsOf(jar: (typeof jars)[number]) {
    const movements = jar.deposits.map((d) => ({
      date: utcDay(d.createdAt),
      // Um resgate com rendimento tira do saldo só o que havia nele.
      amount: Number(d.balanceChange ?? d.amount),
    }));
    const explained = movements.reduce((sum, m) => sum + m.amount, 0);
    const gap = Number(jar.balance) - explained;
    // Sobrando, entrou antes de tudo; faltando, sai das entradas mais antigas.
    if (Math.abs(gap) >= 0.005) {
      movements.push({ date: utcDay(gap > 0 ? jar.createdAt : new Date()), amount: gap });
    }
    return remainingLots(movements).map((lot) => ({
      from: lot.from.toISOString().slice(0, 10),
      amount: lot.amount,
    }));
  }

  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      <PageHeader
        title="Caixinhas"
        subtitle="Onde a sobra do período vai parar"
        action={<JarFormDialog />}
      />

      {jars.length === 0 ? (
        <EmptyState
          icon={PiggyBank}
          text="Nenhuma caixinha criada ainda."
          hint="Use o + para criar uma e guardar o que sobrar no fim do período."
        />
      ) : (
        // Decimal não atravessa para o cliente: o saldo vai como número.
        <JarsGrid
          jars={jars.map((jar) => ({
            id: jar.id,
            name: jar.name,
            balance: Number(jar.balance),
            cdiPercent: jar.cdiPercent === null ? null : Number(jar.cdiPercent),
            lots: lotsOf(jar),
            returns: jarReturns(
              jar.deposits.map((d) => ({
                jarId: jar.id,
                amount: Number(d.balanceChange ?? d.amount),
                date: d.createdAt,
                plannedWithdrawalAt: d.plannedWithdrawalAt,
              })),
              new Date(),
            ).map((r) => ({
              amount: r.amount,
              date: r.date.toISOString().slice(0, 10),
              overdue: r.overdue,
            })),
          }))}
          yieldContext={{
            cdiAnnualPercent: cdi.annualPercent,
            cdiDate: cdi.date,
            cdiSource: cdi.source,
            today: todayInputValue(),
            nextPayday,
            upcomingBills,
          }}
        />
      )}
    </div>
  );
}
