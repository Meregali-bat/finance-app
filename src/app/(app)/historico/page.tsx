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
import { formatCurrency, formatDate, todayInputValue } from "@/lib/format";
import { PeriodPicker } from "@/components/period-picker";
import { ReportTotalsCard } from "@/components/report-totals-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/page-header";
import { HistoryRow } from "@/components/movement-row";
import { CategoryBreakdown, type CategoryGroup } from "@/components/category-breakdown";
import { historyItemKey, type HistoryItem } from "@/lib/history-item";
import { loadHistoryItems } from "@/lib/history-items";
import { prisma } from "@/lib/prisma";
import { parseSlices, sliceOfCategory } from "@/lib/slices";
import { TransactionsTable } from "@/components/transactions-table";
import { SpendingCalendarCard } from "@/components/spending-calendar-card";
import { spendingCalendar } from "@/lib/spending-calendar";

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

  const [{ items, categories, creditCards, categoryNameById }, user] = await Promise.all([
    loadHistoryItems(userId, range),
    prisma.user.findUnique({ where: { id: userId }, select: { budgetSlices: true } }),
  ]);
  const slicesActive = parseSlices(user?.budgetSlices) !== null;

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

  // O calendário troca a linha diária: num período de dias, ele mostra o mesmo
  // ritmo e ainda diz o que saiu em cada dia. Só o dia a dia entra nele — os
  // lançamentos e as compras no cartão no dia em que foram feitas.
  const daily = buckets.length > 1 && buckets[0].unit === "day";
  const today = todayInputValue();
  const calendar = daily
    ? spendingCalendar({
        firstDay: range.firstDay,
        lastDay: range.lastDay,
        today,
        entries: [
          ...items
            .filter((i) => i.kind === "transaction" && i.amount > 0)
            .map((i) => ({
              date: i.date,
              amount: i.amount,
              description: i.description,
            })),
          ...creditCards.flatMap((card) =>
            card.purchases
              .filter((p) => p.date >= utcRangeStart && p.date < utcRangeEnd)
              .map((p) => ({
                date: p.date,
                amount: Number(p.amount),
                description: p.description,
                cardName: card.name,
              })),
          ),
        ],
      })
    : null;

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
      {calendar && (
        <SpendingCalendarCard
          calendar={calendar}
          initialDay={
            today >= range.firstDay && today <= range.lastDay ? today : (calendar.peak?.key ?? null)
          }
        />
      )}

      {buckets.length > 1 && !daily && (
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
                  ? new Intl.DateTimeFormat("pt-BR", {
                      month: "long",
                      year: "numeric",
                    }).format(bucket.start)
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

        <TabsContent value="lancamentos" className="pt-4">
          {items.length === 0 ? (
            <EmptyState text="Nenhum lançamento neste período." />
          ) : (
            <TransactionsTable
              items={items}
              categories={categories.map((c) => ({
                id: c.id,
                name: c.name,
                slice: sliceOfCategory(c),
              }))}
              cards={cardOptions}
              slicesActive={slicesActive}
            />
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
