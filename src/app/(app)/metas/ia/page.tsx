import { requireUserId } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/page-header";
import { SpendingInsight } from "@/components/spending-insight";

export default async function SpendingInsightPage() {
  await requireUserId();
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 lg:gap-6">
      <PageHeader
        title="Montar com a IA"
        subtitle="Seus gastos reais, categorizados e divididos nas fatias"
        backHref="/metas"
        backLabel="Voltar às Metas"
      />
      <SpendingInsight />
    </div>
  );
}
