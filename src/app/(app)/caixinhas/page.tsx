import { PiggyBank } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { JarFormDialog } from "@/components/forms/jar-form-dialog";
import { JarDepositDialog } from "@/components/forms/jar-deposit-dialog";
import { DeleteIconButton } from "@/components/delete-icon-button";
import { deleteJar } from "@/lib/actions/jar";

export default async function JarsPage() {
  const userId = await requireUserId();
  const jars = await prisma.jar.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-heading font-semibold">Caixinhas</h1>

      <JarFormDialog />

      {jars.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          Nenhuma caixinha criada ainda.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                <p className="text-2xl font-semibold tabular-nums">
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
