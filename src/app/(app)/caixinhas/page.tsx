import { PiggyBank } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/page-header";
import { JarFormDialog } from "@/components/forms/jar-form-dialog";
import { JarsGrid } from "@/components/jars-grid";

export default async function JarsPage() {
  const userId = await requireUserId();
  const jars = await prisma.jar.findMany({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });

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
          hint="Toque no + para criar uma e guardar o que sobrar no fim do período."
        />
      ) : (
        // Decimal não atravessa para o cliente: o saldo vai como número.
        <JarsGrid
          jars={jars.map((jar) => ({ id: jar.id, name: jar.name, balance: Number(jar.balance) }))}
        />
      )}
    </div>
  );
}
