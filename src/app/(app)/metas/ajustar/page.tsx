import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/page-header";
import { SlicesEditor } from "@/components/slices-editor";
import { loadBudgetInputs } from "@/lib/budget-inputs";
import { todayBudget } from "@/lib/today-budget";
import { DEFAULT_SLICES, SLICE_KEYS, parseSlices, sliceOfCategory } from "@/lib/slices";

export default async function AdjustSlicesPage({
  searchParams,
}: {
  searchParams: Promise<{ proposta?: string }>;
}) {
  const userId = await requireUserId();
  // A proposta da IA ("25,30,15,15,10,5", na ordem das fatias) como ponto de partida.
  const { proposta } = await searchParams;
  const proposal = parseSlices(
    Object.fromEntries(SLICE_KEYS.map((k, i) => [k, Number(proposta?.split(",")[i])])),
  );
  const [user, categories, jars, inputs] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { budgetSlices: true } }),
    prisma.category.findMany({ where: { userId, active: true }, orderBy: { name: "asc" } }),
    prisma.jar.findMany({ where: { userId, deletedAt: null }, orderBy: { createdAt: "asc" } }),
    loadBudgetInputs(userId),
  ]);
  const saved = parseSlices(user?.budgetSlices);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 lg:gap-6">
      <PageHeader
        title="Ajustar fatias"
        subtitle="Quanto da renda vai para cada destino"
        backHref="/metas"
        backLabel="Voltar às Metas"
      />
      <SlicesEditor
        active={saved !== null}
        initialPercents={proposal ?? saved ?? DEFAULT_SLICES}
        income={todayBudget(inputs, new Date()).budget.incomeTotal}
        categories={categories.map((c) => ({ id: c.id, name: c.name, slice: sliceOfCategory(c) }))}
        jars={jars.map((j) => ({
          id: j.id,
          name: j.name,
          slice: j.slice === "goals" ? ("goals" as const) : ("freedom" as const),
        }))}
      />
    </div>
  );
}
