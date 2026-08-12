import { PiggyBank } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/page-header";
import { JarFormDialog } from "@/components/forms/jar-form-dialog";
import { JarDepositDialog } from "@/components/forms/jar-deposit-dialog";
import { DeleteIconButton } from "@/components/delete-icon-button";
import { deleteJar } from "@/lib/actions/jar";

export default async function JarsPage() {
  const userId = await requireUserId();
  const jars = await prisma.jar.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Caixinhas" subtitle="Onde a sobra do período vai parar" />

      <JarFormDialog />

      {jars.length === 0 ? (
        <EmptyState
          icon={PiggyBank}
          text="Nenhuma caixinha criada ainda."
          hint="Crie uma para guardar o que sobrar no fim do período."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {jars.map((jar) => (
            <Card key={jar.id}>
              <CardContent className="flex flex-col gap-3 py-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <PiggyBank className="size-5 shrink-0 text-primary" aria-hidden="true" />
                    <p className="truncate font-medium">{jar.name}</p>
                  </div>
                  <DeleteIconButton
                    action={deleteJar.bind(null, jar.id)}
                    confirmMessage={`Excluir a caixinha "${jar.name}"? O saldo guardado será perdido do histórico.`}
                  />
                </div>
                <p className="font-heading text-2xl leading-tight font-semibold tracking-[-0.02em] tabular-nums">
                  {formatCurrency(Number(jar.balance))}
                </p>
                <JarDepositDialog jarId={jar.id} jarName={jar.name} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
