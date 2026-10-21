import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/page-header";
import { SlicesEditor } from "@/components/slices-editor";
import { DEFAULT_SLICES, parseSlices, sliceOfCategory } from "@/lib/slices";

export default async function AdjustSlicesPage() {
  const userId = await requireUserId();
  const [user, categories, jars] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { budgetSlices: true } }),
    prisma.category.findMany({ where: { userId, active: true }, orderBy: { name: "asc" } }),
    prisma.jar.findMany({ where: { userId, deletedAt: null }, orderBy: { createdAt: "asc" } }),
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
        initialPercents={saved ?? DEFAULT_SLICES}
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
