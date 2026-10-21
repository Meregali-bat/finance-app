import Link from "next/link";
import { FileUp } from "lucide-react";
import { iconButton } from "@/components/ui/icon-button";
import { requireUserId } from "@/lib/auth-helpers";
import { resolveRange, type RangeParams } from "@/lib/date-range";
import { calculateReportTotals, countsAsSpending, spendingBuckets } from "@/lib/report-totals";
import { LineChart } from "@/components/charts/line-chart";
import { homeCard } from "@/components/home-card";
import { stagger } from "@/components/list-row";
import { SectionLabel } from "@/components/page-header";
import { formatCurrency, formatDate } from "@/lib/format";
import { PeriodPicker } from "@/components/period-picker";
import { ReportTotalsCard } from "@/components/report-totals-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/page-header";
import { HistoryRow } from "@/components/movement-row";
import { CategoryBreakdown, type CategoryGroup } from "@/components/category-breakdown";
import { historyItemKey, type HistoryItem } from "@/lib/history-item";
import { loadHistoryItems } from "@/lib/history-items";

const UNCATEGORIZED = "__none__";
const LENT = "__lent__";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<RangeParams>;
}) {
  const params = await searchParams;
  const userId = await requireUserId();
  const range = resolveRange(params);
  // Duas bordas para duas convenções de gravação: lançamentos guardam um dia
  // do calendário em meia-noite UTC, confirmações guardam instantes locais.
  const { rangeStart, rangeEnd, utcRangeStart, utcRangeEnd } = range;

  const { items, categories, creditCards, categoryNameById } = await loadHistoryItems(
    userId,
    range,
  );

  const totals = calculateReportTotals({ items, rangeStart, rangeEnd, today: new Date() });
  const buckets = spendingBuckets({ items, rangeStart, rangeEnd });

  // Agrupado por id, não por nome: nada impede duas categorias homônimas, e
  // fundi-las num balde só esconderia a diferença.
  const byCategory = new Map<string, { amount: number; items: HistoryItem[] }>();
  for (const item of items.filter(countsAsSpending)) {
    // O emprestado vai para um balde próprio: o jantar pago para um amigo não
    // é gasto seu com "Alimentação", mesmo que tenha saído do seu bolso.
    const key = item.lentTo ? LENT : (item.categoryId ?? UNCATEGORIZED);
    const group = byCategory.get(key) ?? { amount: 0, items: [] };
    group.amount += item.amount;
    group.items.push(item);
    byCategory.set(key, group);
  }

  const categoryGroups: CategoryGroup[] = Array.from(byCategory.entries())
    .map(([key, group]) => ({
      key,
      name:
        key === LENT
          ? "Emprestado"
          : key === UNCATEGORIZED
            ? "Sem categoria"
            : (categoryNameById.get(key) ?? "Sem categoria"),
      amount: group.amount,
      items: group.items,
      percent:
        totals.spent !== 0 ? Math.max(0, Math.round((group.amount / totals.spent) * 100)) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name }));
  const cardOptions = creditCards.filter((c) => c.active).map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Histórico"
        action={
          <Link
            href="/historico/importar"
            aria-label="Importar extrato"
            title="Importar extrato"
            className={iconButton({ tone: "outline", size: "lg" })}
          >
            <FileUp aria-hidden="true" />
          </Link>
        }
      />

      {/* O seletor de período é o controle principal desta tela, então ele
          ganha uma superfície própria em vez de flutuar solto sobre o fundo. */}
      <PeriodPicker range={range} />

      <ReportTotalsCard totals={totals} />

      {/* O gasto do período no tempo: uma série só, em rosé, sem legenda — o
          título diz o que é. As colunas somam o "Gasto" do resumo. */}
      {buckets.length > 1 && (
        <div
          className={homeCard("rise-in flex flex-col gap-4")}
          style={{ "--rise-delay": "140ms" } as React.CSSProperties}
        >
          <SectionLabel>
            {buckets[0].unit === "month" ? "Gasto por mês" : "Gasto por dia"}
          </SectionLabel>
          <LineChart
            title={buckets[0].unit === "month" ? "Gasto por mês" : "Gasto por dia"}
            height={150}
            points={buckets.map((bucket, index) => ({
              key: bucket.start.toISOString(),
              // Rótulo a cada poucos dias, para o eixo não virar uma sopa.
              label:
                bucket.unit === "month"
                  ? new Intl.DateTimeFormat("pt-BR", { month: "short" })
                      .format(bucket.start)
                      .replace(".", "")
                  : index % Math.max(2, Math.ceil(buckets.length / 10)) === 0
                    ? String(bucket.start.getDate())
                    : "",
              value: bucket.total,
              valueLabel: formatCurrency(bucket.total),
              detail:
                bucket.unit === "month"
                  ? new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
                      bucket.start,
                    )
                  : formatDate(bucket.start),
              selected:
                bucket.total === Math.max(...buckets.map((b) => b.total)) && bucket.total > 0,
            }))}
          />
        </div>
      )}

      <Tabs
        defaultValue="lancamentos"
        className="rise-in"
        style={{ "--rise-delay": "180ms" } as React.CSSProperties}
      >
        <TabsList className="w-full lg:w-fit">
          <TabsTrigger value="lancamentos" className="flex-1 lg:flex-none">
            Lançamentos
          </TabsTrigger>
          <TabsTrigger value="categorias" className="flex-1 lg:flex-none">
            Por categoria
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lancamentos" className="grid gap-2 pt-4 xl:grid-cols-2">
          {items.length === 0 ? (
            <EmptyState text="Nenhum lançamento neste período." />
          ) : (
            items.map((item, index) => (
              // Escalonado só no começo da lista: num mês cheio, a centésima
              // linha não pode esperar quatro segundos para aparecer.
              <div
                key={historyItemKey(item)}
                className="rise-in"
                style={stagger(Math.min(index, 12), 200, 45)}
              >
                <HistoryRow item={item} cards={cardOptions} categories={categoryOptions} />
              </div>
            ))
          )}
        </TabsContent>

        {/* Coluna única de propósito: o acordeão anima a altura ao expandir, e
            em grid isso faria a coluna vizinha pular. */}
        <TabsContent value="categorias" className="pt-4">
          {categoryGroups.length === 0 ? (
            <EmptyState text="Nenhum lançamento neste período." />
          ) : (
            <CategoryBreakdown
              groups={categoryGroups}
              cards={cardOptions}
              categories={categoryOptions}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
