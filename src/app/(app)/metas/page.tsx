import Link from "next/link";
import { AlertTriangle, PiggyBank, SlidersHorizontal, Target } from "lucide-react";
import { requireUserId } from "@/lib/auth-helpers";
import { loadSlicesOverview } from "@/lib/slices-data";
import { SLICES, savingPercent } from "@/lib/slices";
import { formatCurrency, formatDate } from "@/lib/format";
import { PageHeader, SectionLabel, StatLabel } from "@/components/page-header";
import { homeCard } from "@/components/home-card";
import { stagger } from "@/components/list-row";
import { iconButton } from "@/components/ui/icon-button";
import { buttonVariants } from "@/components/ui/button";
import { SliceDonut } from "@/components/slice-donut";
import { CategorizeList } from "@/components/categorize-list";
import { cn } from "@/lib/utils";

export default async function SlicesPage() {
  const userId = await requireUserId();
  const today = new Date();
  const overview = await loadSlicesOverview(userId, today);
  const until = new Date(overview.periodEnd.getTime() - 86_400_000);
  const subtitle = `De ${formatDate(overview.periodStart)} a ${formatDate(until)}`;

  if (!overview.configured || !overview.percents) {
    return (
      <div className="flex flex-col gap-5 lg:gap-6">
        <PageHeader title="Metas" subtitle="As fatias da sua renda" />
        <div className={homeCard("flex flex-col items-start gap-4 lg:max-w-2xl")}>
          <span
            aria-hidden="true"
            className="flex size-11 items-center justify-center rounded-2xl bg-primary/12 text-primary"
          >
            <Target className="size-5" />
          </span>
          <div className="flex flex-col gap-1.5">
            <p className="font-heading text-lg font-semibold">Divida a renda em fatias</p>
            <p className="text-sm text-muted-foreground">
              Uma parte para os custos fixos, outra para o conforto, para os prazeres, para aprender
              — e duas para guardar: Metas e Liberdade financeira. O que ainda falta guardar no
              período sai do seu número do dia, e o que você guarda nas caixinhas vai cumprindo a
              fatia.
            </p>
          </div>
          <Link href="/metas/ajustar" className={buttonVariants()}>
            Configurar as fatias
          </Link>
        </div>
      </div>
    );
  }

  const percents = overview.percents;
  const savings = overview.savings;
  const usageByKey = new Map(overview.usage.map((u) => [u.key, u]));
  const spent = overview.usage
    .filter((u) => !SLICES.find((s) => s.key === u.key)!.saving)
    .reduce((sum, u) => sum + u.used, 0);

  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      <PageHeader
        title="Metas"
        subtitle={subtitle}
        action={
          <Link
            href="/metas/ajustar"
            aria-label="Ajustar as fatias"
            title="Ajustar as fatias"
            className={iconButton({ tone: "outline", size: "lg" })}
          >
            <SlidersHorizontal aria-hidden="true" />
          </Link>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-4">
        <div className={homeCard("rise-in flex items-center gap-5")} style={stagger(0, 60)}>
          <SliceDonut
            size={132}
            label={SLICES.map((s) => `${s.name} ${percents[s.key]}%`).join(", ")}
            segments={SLICES.map((s) => ({ key: s.key, value: percents[s.key], color: s.color }))}
          >
            <span className="font-heading text-lg font-bold tabular-nums">
              {savingPercent(percents)}%
            </span>
            <span className="text-[11px] text-muted-foreground">para guardar</span>
          </SliceDonut>
          <dl className="flex min-w-0 flex-1 flex-col gap-3">
            <div>
              <StatLabel>Renda do período</StatLabel>
              <dd className="font-heading text-xl font-bold tabular-nums">
                {formatCurrency(overview.income)}
              </dd>
            </div>
            <div>
              <StatLabel>Gasto nas fatias</StatLabel>
              <dd className="font-heading text-xl font-bold tabular-nums">
                {formatCurrency(spent)}
              </dd>
            </div>
          </dl>
        </div>

        {savings && (
          <div
            className={homeCard("rise-in flex flex-col justify-between gap-4")}
            style={stagger(1, 60)}
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-positive/12 text-positive"
              >
                <PiggyBank className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="font-heading text-[15px] font-semibold">
                  Guardar neste período: {formatCurrency(savings.target)}
                </p>
                <p className="text-[13px] text-muted-foreground">
                  {savings.remaining < 0.005
                    ? "Meta do período cumprida. Nada mais sai do seu número do dia."
                    : `Faltam ${formatCurrency(savings.remaining)}. ${
                        savings.applied > 0.005
                          ? `${formatCurrency(savings.applied)} já estão separados do seu número do dia.`
                          : ""
                      }`}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="h-2 overflow-hidden rounded-full bg-(--track)">
                <div
                  className="h-full rounded-full bg-positive transition-[width] duration-500 ease-out-quint"
                  style={{
                    width: `${savings.target > 0 ? Math.min(100, (savings.saved / savings.target) * 100) : 0}%`,
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatCurrency(savings.saved)} guardados nas caixinhas
              </p>
            </div>
            {savings.shortfall > 0.005 && (
              <p className="flex items-start gap-2 rounded-xl bg-negative/8 px-3 py-2 text-[13px] ring-1 ring-negative/20">
                <AlertTriangle
                  className="mt-0.5 size-4 shrink-0 text-negative"
                  aria-hidden="true"
                />
                Este período não fecha com tudo guardado: faltam {formatCurrency(savings.shortfall)}{" "}
                depois das contas e faturas.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <SectionLabel>As fatias</SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {SLICES.map((slice, index) => {
            const usage = usageByKey.get(slice.key)!;
            const left = usage.limit - usage.used;
            const over = left < -0.005;
            return (
              <div
                key={slice.key}
                className={homeCard("rise-in flex flex-col gap-3")}
                style={stagger(index, 140)}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="flex min-w-0 items-center gap-2 font-heading text-[15px] font-semibold">
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: slice.color }}
                    />
                    <span className="truncate">{slice.name}</span>
                    <span className="text-xs font-medium text-muted-foreground">
                      {percents[slice.key]}%
                    </span>
                  </p>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
                      over ? "bg-negative/12 text-negative" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {usage.used < 0.005
                      ? slice.saving
                        ? "Nada guardado"
                        : "Sem gastos"
                      : `${usage.percentUsed.toLocaleString("pt-BR")}%`}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-(--track)">
                  <div
                    className="h-full rounded-full transition-[width] duration-500 ease-out-quint"
                    style={{
                      width: `${Math.min(100, usage.percentUsed)}%`,
                      background: over ? "var(--negative)" : slice.color,
                    }}
                  />
                </div>
                <dl className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-muted px-3 py-2">
                    <dt className="text-[11.5px] text-muted-foreground">
                      {slice.saving ? "Guardado" : "Gasto"}
                    </dt>
                    <dd className="text-sm font-semibold tabular-nums">
                      {formatCurrency(usage.used)}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-muted px-3 py-2">
                    <dt className="text-[11.5px] text-muted-foreground">Previsto</dt>
                    <dd className="text-sm font-semibold tabular-nums">
                      {formatCurrency(usage.limit)}
                    </dd>
                  </div>
                </dl>
                <p className="flex items-center justify-between gap-2 text-[12.5px]">
                  <span className={cn("tabular-nums", over ? "text-negative" : "text-positive")}>
                    {over
                      ? `${formatCurrency(-left)} além do previsto`
                      : `${formatCurrency(left)} ${slice.saving ? "para guardar" : "restante"}`}
                  </span>
                  <span className="text-muted-foreground">
                    {usage.count === 1 ? "1 lançamento" : `${usage.count} lançamentos`}
                  </span>
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {overview.uncategorized.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionLabel>
            {overview.uncategorized.length === 1
              ? "1 gasto sem categoria"
              : `${overview.uncategorized.length} gastos sem categoria`}
          </SectionLabel>
          <p className="-mt-1 text-[13px] text-muted-foreground">
            Sem categoria, o gasto não entra em nenhuma fatia. Escolha uma e ele passa a contar.
          </p>
          <CategorizeList
            items={overview.uncategorized.map((i) => ({
              id: i.id,
              kind: i.kind,
              description: i.description,
              amount: i.amount,
              date: formatDate(i.date),
            }))}
            categories={overview.categories.map((c) => ({ id: c.id, name: c.name }))}
          />
        </div>
      )}
    </div>
  );
}
