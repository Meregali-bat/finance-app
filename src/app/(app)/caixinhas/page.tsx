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

export default async function JarsPage() {
  const userId = await requireUserId();
  const [jars, inputs, cdi] = await Promise.all([
    prisma.jar.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: "asc" },
    }),
    loadBudgetInputs(userId),
    currentCdi(),
  ]);
  // O próximo pagamento é o fim do período: o dia em que o dinheiro guardado
  // costuma voltar a fazer falta, e por isso a data de resgate sugerida.
  const { budget } = todayBudget(inputs, new Date());
  const end = budget.periodEnd;
  const nextPayday =
    inputs.incomes.length > 0
      ? `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`
      : null;

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
          }))}
          yieldContext={{
            cdiAnnualPercent: cdi.annualPercent,
            cdiDate: cdi.date,
            cdiSource: cdi.source,
            today: todayInputValue(),
            nextPayday,
          }}
        />
      )}
    </div>
  );
}
