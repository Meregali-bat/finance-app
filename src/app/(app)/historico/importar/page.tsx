import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/page-header";
import { StatementImport } from "@/components/statement-import";

export default async function ImportStatementPage() {
  const userId = await requireUserId();
  const categories = await prisma.category.findMany({
    where: { userId },
    select: { id: true, name: true },
  });
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 lg:gap-6">
      <PageHeader
        title="Importar extrato"
        subtitle="Nubank, Sicoob ou Banrisul, conferido com o app"
        backHref="/historico"
        backLabel="Voltar ao Histórico"
      />
      <StatementImport categories={categories} />
    </div>
  );
}
