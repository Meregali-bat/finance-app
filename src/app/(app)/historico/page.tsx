import Link from "next/link";
import { FileUp } from "lucide-react";
import { iconButton } from "@/components/ui/icon-button";
import { requireUserId } from "@/lib/auth-helpers";
import { resolveRange, type CycleOf, type RangeParams } from "@/lib/date-range";
import {
  calculateReportTotals,
  countsAsSpending,
  ownSpending,
  spendingBuckets,
} from "@/lib/report-totals";
import { LineChart } from "@/components/charts/line-chart";
import { homeCard } from "@/components/home-card";
import { SectionLabel } from "@/components/page-header";
import { formatCurrency, formatDate, todayInputValue } from "@/lib/format";
import { PeriodPicker } from "@/components/period-picker";
import { ReportTotalsCard, type PeriodAccount } from "@/components/report-totals-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/page-header";
import { CategoryBreakdown, type CategoryGroup } from "@/components/category-breakdown";
import { lentNames, type HistoryItem } from "@/lib/history-item";
import { loadHistoryItems } from "@/lib/history-items";
import { loadBudgetInputs } from "@/lib/budget-inputs";
import { getPeriodBoundsDetailed } from "@/lib/period";
import { balanceAtDay } from "@/lib/account-balance";
import { prisma } from "@/lib/prisma";
import { parseSlices, sliceOfCategory } from "@/lib/slices";
import { TransactionsTable } from "@/components/transactions-table";
import { SpendingCalendarCard } from "@/components/spending-calendar-card";
import { HistoryDayProvider } from "@/components/history-day";
import { spendingCalendar } from "@/lib/spending-calendar";

const UNCATEGORIZED = "__none__";
const LENT = "__lent__";
const UNDETAILED = "__undetailed__";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<RangeParams>;
}) {
  const params = await searchParams;
  const userId = await requireUserId();
  // As rendas marcam o ciclo; as leituras do extrato, o saldo.
  const inputs = await loadBudgetInputs(userId);
  // No Histórico, o ciclo é só a régua dos dias de pagamento: vale também
  // antes de a renda ser cadastrada, que é quando a Início começa a contar.
  const payRule = inputs.incomes.map((i) => ({ ...i, createdAt: new Date(0) }));
  const cycleOf: CycleOf = (day) => {
    const bounds = getPeriodBoundsDetailed(payRule, day, inputs.incomeReceipts);
    return bounds.fallback ? null : bounds;
  };
  const now = new Date();
  const range = resolveRange(params, now, cycleOf);
  // Duas bordas para duas convenções de gravação: lançamentos guardam um dia
  // do calendário em meia-noite UTC, confirmações guardam instantes locais.
  const { rangeStart, rangeEnd, utcRangeStart, utcRangeEnd } = range;

  const [{ items, categories, creditCards, categoryNameById }, user] = await Promise.all([
    loadHistoryItems(userId, range),
    prisma.user.findUnique({ where: { id: userId }, select: { budgetSlices: true } }),
  ]);
  const slicesActive = parseSlices(user?.budgetSlices) !== null;

  const totals = calculateReportTotals({ items, rangeStart, rangeEnd, today: now });

  // O saldo da conta no fim do período — ou hoje, se ele ainda corre —, pelo
  // que foi conferido com o banco. Somar os meses desde o primeiro registro
  // não dava isso: o app não sabe o que havia antes dele.
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lastDay = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate() - 1);
  const past = lastDay.getTime() < todayStart.getTime();
  const anchored = balanceAtDay({
    adjustments: inputs.account.adjustments ?? [],
    credits: inputs.account.credits,
    debits: inputs.account.debits,
    day: past ? lastDay : now,
  });
  const account: PeriodAccount | null = anchored
    ? {
        balance: anchored.balance,
        label: past ? `Saldo em ${formatDate(lastDay)}` : "Saldo em conta",
        checkedAt: anchored.from.createdAt,
      }
    : null;
  const buckets = spendingBuckets({ items, rangeStart, rangeEnd });

  // Agrupado por id, não por nome: nada impede duas categorias homônimas, e
  // fundi-las num balde só esconderia a diferença.
  const byCategory = new Map<string, { amount: number; items: HistoryItem[] }>();
  const addTo = (key: string, amount: number, item: HistoryItem) => {
    if (Math.abs(amount) < 0.005) return;
    const group = byCategory.get(key) ?? { amount: 0, items: [] };
    group.amount += amount;
    group.items.push(item);
    byCategory.set(key, group);
  };
  for (const item of items.filter(countsAsSpending)) {
    // O emprestado vai para um balde próprio: o jantar pago para um amigo não
    // é gasto seu com "Alimentação", mesmo que tenha saído do seu bolso. Numa
    // conta dividida, só a parte dele vai para lá.
    // O valor da fatura que não veio detalhado em compras não tem categoria a
    // dar: no "Sem categoria", ele se misturava ao que dá para categorizar.
    const key =
      item.kind === "cardEstimate" || item.kind === "cardBillAdjustment"
        ? UNDETAILED
        : (item.categoryId ?? UNCATEGORIZED);
    addTo(key, ownSpending(item), item);
    addTo(LENT, item.lent ?? 0, item);
  }

  const categoryGroups: CategoryGroup[] = Array.from(byCategory.entries())
    .map(([key, group]) => ({
      key,
      name:
        key === LENT
          ? "Emprestado"
          : key === UNDETAILED
            ? "Não detalhado no cartão"
          : key === UNCATEGORIZED
            ? "Sem categoria"
            : (categoryNameById.get(key) ?? "Sem categoria"),
      amount: group.amount,
      items: group.items,
      percent: 0,
    }))
    .sort((a, b) => b.amount - a.amount);
  // Pelo maior resto: arredondar cada uma sozinha fazia a soma dar 101%. Sobre
  // a soma dos baldes, que inclui o emprestado — o Gasto do resumo não.
  const grouped = categoryGroups.reduce((sum, g) => sum + g.amount, 0);
  if (grouped > 0) {
    const shares = categoryGroups.map((g) => Math.max(0, (g.amount / grouped) * 100));
    const floors = shares.map(Math.floor);
    let left = Math.round(shares.reduce((a, b) => a + b, 0)) - floors.reduce((a, b) => a + b, 0);
    const byRemainder = shares
      .map((share, i) => ({ i, rest: share - floors[i] }))
      .sort((a, b) => b.rest - a.rest);
    for (const { i } of byRemainder) {
      if (left <= 0) break;
      floors[i] += 1;
      left -= 1;
    }
    categoryGroups.forEach((g, i) => (g.percent = floors[i]));
  }

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
          // O gasto seu, como o resumo: sem transferências e sem a parte
          // emprestada.
          ...items
            .filter((i) => i.kind === "transaction" && ownSpending(i) > 0)
            .map((i) => ({
              date: i.date,
              amount: ownSpending(i),
              description: i.description,
            })),
          ...creditCards.flatMap((card) =>
            card.purchases
              .filter((p) => p.date >= utcRangeStart && p.date < utcRangeEnd)
              .map((p) => ({
                date: p.date,
                amount: Math.max(
                  0,
                  Number(p.amount) - p.loans.reduce((sum, l) => sum + Number(l.amount), 0),
                ),
                description: p.description,
                cardName: card.name,
              }))
              .filter((p) => p.amount > 0),
          ),
        ],
      })
    : null;

  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name }));
  // As compras feitas no período, inteiras e no dia da compra: é como o
  // calendário as mostra, e a listagem filtrada por um dia mostra o mesmo.
  const periodPurchases: HistoryItem[] = creditCards.flatMap((card) =>
    card.purchases
      .filter((p) => p.date >= utcRangeStart && p.date < utcRangeEnd)
      .map((p) => ({
        id: p.id,
        kind: "card" as const,
        description: p.description,
        amount: Number(p.amount),
        date: p.date,
        createdAt: p.createdAt,
        categoryId: p.categoryId,
        slice: p.slice,
        cardId: card.id,
        cardName: card.name,
        installments: p.installments,
        purchaseAmount: Number(p.amount),
        purchaseDate: p.date,
        lentTo: lentNames(p.loans),
        lent:
          p.loans.length > 0
            ? p.loans.reduce((sum, l) => sum + Number(l.amount), 0)
            : undefined,
      })),
  );

  const cardOptions = creditCards.filter((c) => c.active).map((c) => ({ id: c.id, name: c.name }));

  return (
    // O dia tocado no calendário filtra a listagem: os dois falam por aqui.
    // Com a chave do período, trocar de mês recomeça o dia escolhido e os
    // filtros da lista: um dia de outubro aplicado a setembro esvaziava tudo.
    <HistoryDayProvider key={`${range.firstDay}_${range.lastDay}`}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Histórico"
          action={
            <Link
              href="/historico/importar"
              title="Importar extrato"
              className={iconButton({ tone: "outline", size: "pill" })}
            >
              <FileUp aria-hidden="true" />
              Importar
            </Link>
          }
        />

        {/* O seletor de período é o controle principal desta tela, então ele
          ganha uma superfície própria em vez de flutuar solto sobre o fundo. */}
        <PeriodPicker range={range} cycles={inputs.incomes.some((i) => i.active)} />

        <ReportTotalsCard totals={totals} account={account} />

        {/* O gasto do período no tempo: uma série só, em rosé, sem legenda — o
          título diz o que é. As colunas somam o "Gasto" do resumo. */}
        {calendar && (
          <SpendingCalendarCard calendar={calendar} today={today} />
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

          {/* Montada mesmo escondida: trocar de aba apagava a busca e os filtros. */}
          <TabsContent value="lancamentos" keepMounted className="pt-4">
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
                purchases={periodPurchases}
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
    </HistoryDayProvider>
  );
}
