import Link from "next/link";
import {
  AlertTriangle,
  ChevronDown,
  PiggyBank,
  SlidersHorizontal,
  Sparkles,
  Target,
} from "lucide-react";
import { requireUserId } from "@/lib/auth-helpers";
import { loadSlicesOverview } from "@/lib/slices-data";
import { SLICES, savingPercent } from "@/lib/slices";
import { formatCurrency, formatDate } from "@/lib/format";
import { PageHeader, SectionLabel } from "@/components/page-header";
import { homeCard } from "@/components/home-card";
import { stagger } from "@/components/list-row";
import { iconButton } from "@/components/ui/icon-button";
import { buttonVariants } from "@/components/ui/button";
import { SliceDonut } from "@/components/slice-donut";
import { CategorizeList } from "@/components/categorize-list";
import { cn } from "@/lib/utils";

/** O gasto sem categoria que esta tela não tem como categorizar. */
const OUTSIDE: Record<string, string> = {
  cardEstimate: "Previsão da fatura",
  cardBillAdjustment: "Diferença da fatura",
  cardFixedExpense: "Categoria em Fixos",
  fixedExpensePayment: "Categoria em Fixos",
  fixedExpenseOpen: "A pagar · categoria em Fixos",
};

export default async function SlicesPage() {
  const userId = await requireUserId();
  const today = new Date();
  const overview = await loadSlicesOverview(userId, today);
  // O período vai de um pagamento ao outro: nomear os dois bate com a Início ("até 15 de nov.").
  const subtitle = `Do pagamento de ${formatDate(overview.periodStart)} ao de ${formatDate(overview.periodEnd)}`;

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
          <div className="flex flex-wrap gap-2">
            <Link href="/metas/ia" className={buttonVariants()}>
              <Sparkles aria-hidden="true" />
              Montar com a IA
            </Link>
            <Link href="/metas/ajustar" className={buttonVariants({ variant: "outline" })}>
              Configurar à mão
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const percents = overview.percents;
  const savings = overview.savings;
  const noIncome = overview.income < 0.005;
  const usageByKey = new Map(overview.usage.map((u) => [u.key, u]));
  const spent = overview.usage
    .filter((u) => !SLICES.find((s) => s.key === u.key)!.saving)
    .reduce((sum, u) => sum + u.used, 0);
  const choosable = overview.uncategorized.filter(
    (i) => i.kind === "transaction" || i.kind === "card",
  );
  const outside = overview.uncategorized.filter((i) => !choosable.includes(i));
  const outsideTotal = outside.reduce((sum, i) => sum + i.amount, 0);
  // O sem fatia também é dinheiro que saiu: o total do período o inclui.
  const unsliced = overview.uncategorized.reduce((sum, i) => sum + i.amount, 0);
  const totalSpent = spent + unsliced;
  // A comparação é com o que a divisão deixa gastar, não com a renda inteira.
  const allowance = overview.income * ((100 - savingPercent(percents)) / 100);
  const pastAllowance = totalSpent - allowance;
  // As que mais passaram do previsto: o que olhar primeiro.
  const overSlices = SLICES.filter((s) => !s.saving)
    .map((s) => {
      const u = usageByKey.get(s.key)!;
      return { name: s.name, by: u.used - u.limit };
    })
    .filter((o) => o.by > 0.005)
    .sort((a, b) => b.by - a.by)
    .slice(0, 2);

  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      <PageHeader
        title="Metas"
        subtitle={subtitle}
        action={
          <>
            <Link
              href="/metas/ia"
              aria-label="Montar com a IA"
              title="Montar com a IA"
              className={iconButton({ tone: "outline", size: "lg" })}
            >
              <Sparkles aria-hidden="true" />
            </Link>
            <Link
              href="/metas/ajustar"
              aria-label="Ajustar as fatias"
              title="Ajustar as fatias"
              className={iconButton({ tone: "outline", size: "lg" })}
            >
              <SlidersHorizontal aria-hidden="true" />
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-4">
        <div className={homeCard("rise-in flex flex-col gap-4")} style={stagger(0, 60)}>
          {!noIncome && (
            <div className="flex flex-col gap-1 border-b border-(--hairline) pb-4 tabular-nums">
              <p
                className={cn(
                  "font-heading text-[17px] leading-snug font-semibold text-balance lg:text-lg",
                  pastAllowance > 0.005 ? "text-negative" : "text-foreground",
                )}
              >
                {pastAllowance > 0.005
                  ? `${formatCurrency(pastAllowance)} além dos ${formatCurrency(allowance)} que a divisão deixa gastar`
                  : `Pela divisão, ainda cabem ${formatCurrency(-pastAllowance)} dos ${formatCurrency(allowance)}`}
              </p>
              {overSlices.length > 0 && (
                <p className="text-[13px] text-muted-foreground">
                  Mais acima do previsto:{" "}
                  {overSlices.map((o) => `${o.name} (+${formatCurrency(o.by)})`).join(" e ")}.
                </p>
              )}
              {/* A divisão é o plano; o número do dia é o dinheiro de verdade. */}
              <p className="text-[13px] text-pretty text-muted-foreground">
                Pelo seu dinheiro de agora, você pode gastar{" "}
                <span className="font-semibold text-foreground">
                  {formatCurrency(overview.dailyAvailable)}
                </span>{" "}
                hoje.
              </p>
            </div>
          )}
          <div className="flex items-center gap-5">
            <SliceDonut
              size={112}
              label={SLICES.map((s) => `${s.name} ${percents[s.key]}%`).join(", ")}
              segments={SLICES.map((s) => ({
                key: s.key,
                value: percents[s.key],
                color: s.color,
              }))}
            >
              <span className="font-heading text-lg font-bold tabular-nums">
                {savingPercent(percents)}%
              </span>
              <span className="text-xs text-muted-foreground">para guardar</span>
            </SliceDonut>
            <dl className="flex min-w-0 flex-1 flex-col gap-3">
              <div>
                <dt className="text-[12.5px] font-medium text-muted-foreground">
                  Renda do período
                </dt>
                <dd className="font-heading text-xl font-bold tabular-nums">
                  {formatCurrency(overview.income)}
                </dd>
              </div>
              <div>
                <dt className="text-[12.5px] font-medium text-muted-foreground">
                  Comprometido no período
                </dt>
                <dd className="font-heading text-xl font-bold tabular-nums">
                  {formatCurrency(totalSpent)}
                </dd>
                {overview.toPay > 0.005 && (
                  <dd className="mt-0.5 text-[12.5px] text-muted-foreground tabular-nums">
                    {formatCurrency(overview.toPay)} ainda a pagar
                  </dd>
                )}
                {Math.abs(unsliced) > 0.005 && (
                  <dd className="text-[12.5px] text-muted-foreground tabular-nums">
                    {formatCurrency(unsliced)} sem fatia
                  </dd>
                )}
              </div>
            </dl>
          </div>
        </div>

        {savings && !noIncome && (
          <div
            className={homeCard("rise-in flex flex-col gap-4 lg:self-start")}
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
                    : savings.applied >= savings.remaining - 0.005
                      ? `Faltam ${formatCurrency(savings.remaining)}, e esse valor já está fora do seu número do dia.`
                      : savings.applied > 0.005
                        ? `Faltam ${formatCurrency(savings.remaining)}; ${formatCurrency(savings.applied)} disso já estão fora do seu número do dia.`
                        : `Faltam ${formatCurrency(savings.remaining)}.`}
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
        <p className="-mt-1 text-[13px] text-muted-foreground">
          Compras no cartão entram na fatia do período em que a fatura vence.
        </p>
        {noIncome ? (
          <div className={homeCard("flex items-start gap-3")}>
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <p className="text-sm text-muted-foreground">
              Nenhuma renda confirmada neste período ainda. Cada fatia é uma parte da renda: assim
              que o salário for confirmado, aparece quanto cabe em cada uma.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {SLICES.map((slice, index) => {
              const usage = usageByKey.get(slice.key)!;
              // O resgatado desconta; abaixo de zero, a fatia só não guardou.
              const used = slice.saving ? Math.max(0, usage.used) : usage.used;
              const left = usage.limit - used;
              const beyond = left < -0.005;
              // Passar do previsto é estouro no gasto e folga no guardado.
              const over = beyond && !slice.saving;
              const ahead = beyond && slice.saving;
              const percentUsed =
                usage.limit > 0 ? Math.round((used / usage.limit) * 1000) / 10 : used > 0 ? 100 : 0;
              // A reserva do período é uma só: o que uma fatia de guardar tem a
              // mais cobre o que falta na outra.
              const sharedRemaining =
                slice.saving && savings && left > 0.005 && savings.remaining < left - 0.005
                  ? savings.remaining
                  : null;
              // Sem caixinha da fatia, nenhum depósito cai nela.
              const noJar = slice.saving && !overview.jarSlices.has(slice.key);
              // A reserva ainda não fechou: o que sobra aqui é parte do que falta lá.
              const poolShort = slice.saving && !!savings && savings.remaining > 0.005;
              // Inteiro, como na Início.
              const shownPercent = `${Math.round(percentUsed).toLocaleString("pt-BR")}%`;
              return (
                <div
                  key={slice.key}
                  className={homeCard("rise-in flex flex-col gap-3")}
                  style={stagger(index, 140)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="flex min-w-0 items-center gap-2 font-heading text-[15px] font-semibold">
                      <span
                        aria-hidden="true"
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ background: slice.color }}
                      />
                      <span className="truncate">{slice.name}</span>
                      <span className="text-xs font-medium text-muted-foreground">
                        {percents[slice.key]}%
                      </span>
                    </h3>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
                        over
                          ? "bg-negative/8 text-negative"
                          : ahead
                            ? poolShort
                              ? "bg-muted text-muted-foreground"
                              : "bg-positive/10 text-positive"
                            : "bg-muted text-muted-foreground",
                      )}
                    >
                      {used < 0.005
                        ? slice.saving
                          ? "Nada guardado"
                          : "Sem gastos"
                        : usage.limit <= 0
                          ? "Sem previsão"
                          : shownPercent}
                      {used >= 0.005 && usage.limit > 0 && (
                        <span className="sr-only">
                          {slice.saving ? " da meta" : " do previsto"}
                        </span>
                      )}
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={`${slice.name}: ${slice.saving ? "guardado da meta" : "gasto do previsto"}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={
                      usage.limit > 0 ? Math.min(100, Math.round(percentUsed)) : undefined
                    }
                    aria-valuetext={`${shownPercent}${over ? ", passou do previsto" : ""}`}
                    className="h-2 overflow-hidden rounded-full bg-(--track)"
                  >
                    <div
                      className="h-full rounded-full transition-[width] duration-500 ease-out-quint"
                      style={{
                        width: `${Math.min(100, percentUsed)}%`,
                        background: over ? "var(--negative)" : slice.color,
                      }}
                    />
                  </div>
                  <dl className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-muted px-3 py-2">
                      <dt className="text-xs text-muted-foreground">
                        {slice.saving ? "Guardado" : "Gasto"}
                      </dt>
                      <dd className="text-sm font-semibold tabular-nums">{formatCurrency(used)}</dd>
                    </div>
                    <div className="rounded-xl bg-muted px-3 py-2">
                      <dt className="text-xs text-muted-foreground">
                        {slice.saving ? "Meta" : "Previsto"}
                      </dt>
                      <dd className="text-sm font-semibold tabular-nums">
                        {formatCurrency(usage.limit)}
                      </dd>
                    </div>
                  </dl>
                  <p className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-[12.5px]">
                    <span
                      className={cn(
                        "tabular-nums",
                        // Verde só para o que está bem: guardou a mais (com o total
                        // fechado) ou já coberto.
                        over
                          ? "text-negative"
                          : (ahead && !poolShort) || sharedRemaining === 0
                            ? "text-positive"
                            : "text-muted-foreground",
                      )}
                    >
                      {over
                        ? `${formatCurrency(-left)} além do previsto`
                        : ahead
                          ? poolShort
                            ? `${formatCurrency(-left)} a mais, conta para ${SLICES.find((s) => s.saving && s.key !== slice.key)!.name}`
                            : `${formatCurrency(-left)} além da meta`
                          : sharedRemaining !== null
                            ? sharedRemaining < 0.005
                              ? "A outra fatia já cobre o que falta"
                              : `No total faltam ${formatCurrency(sharedRemaining)}`
                            : `${formatCurrency(left)} ${slice.saving ? "para guardar" : "restante"}`}
                    </span>
                    <span className="whitespace-nowrap text-muted-foreground">
                      {usage.count === 0
                        ? null
                        : slice.saving
                          ? usage.count === 1
                            ? "1 depósito"
                            : `${usage.count} depósitos`
                          : usage.count === 1
                            ? "1 lançamento"
                            : `${usage.count} lançamentos`}
                    </span>
                  </p>
                  {noJar && (
                    <Link
                      href="/metas/ajustar"
                      className="-my-2 self-start py-2 text-[12.5px] font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Nenhuma caixinha é desta fatia: escolher em Ajustar
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sempre montada: o Desfazer do último item categorizado não some junto. */}
      <div className={cn("flex flex-col gap-3", choosable.length === 0 && "contents")}>
        {choosable.length > 0 && (
          <>
            <SectionLabel>
              {choosable.length === 1
                ? "1 gasto sem categoria"
                : `${choosable.length} gastos sem categoria`}
            </SectionLabel>
            <p className="-mt-1 text-[13px] text-muted-foreground">
              Sem categoria, o gasto não entra em nenhuma fatia. Escolha uma e ele passa a contar.
            </p>
          </>
        )}
        <CategorizeList
          items={choosable.map((i) => ({
            id: i.id,
            kind: i.kind,
            description: i.description,
            amount: i.amount,
            date: formatDate(i.date),
          }))}
          categories={overview.categories.map((c) => ({
            id: c.id,
            name: c.name,
          }))}
        />
      </div>

      {outside.length > 0 && (
        <details className={homeCard("group py-3 lg:py-3")}>
          <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 text-[13px] [&::-webkit-details-marker]:hidden">
            <span className="text-muted-foreground">
              Não dá para categorizar aqui:{" "}
              {outside.length === 1 ? "1 valor" : `${outside.length} valores`}
            </span>
            <span className="flex shrink-0 items-center gap-2 font-semibold tabular-nums">
              {formatCurrency(outsideTotal)}
              <ChevronDown
                className="size-4 text-muted-foreground transition-transform duration-200 ease-out-quint group-open:rotate-180"
                aria-hidden="true"
              />
            </span>
          </summary>
          <p className="mt-2 text-[12.5px] text-muted-foreground">
            Previsões e diferenças da fatura não têm categoria, então não contam em nenhuma fatia.
            Uma conta fixa ganha categoria em Fixos.
          </p>
          <ul className="mt-2 flex flex-col divide-y divide-(--hairline)">
            {outside.map((i) => (
              <li
                key={`${i.kind}-${i.id}`}
                className="flex items-baseline justify-between gap-3 py-2 text-[13px]"
              >
                <span className="min-w-0 truncate">
                  {i.description}
                  <span className="text-muted-foreground">
                    {" "}
                    · {formatDate(i.date)} · {OUTSIDE[i.kind] ?? "sem categoria"}
                    {i.cardName ? ` · ${i.cardName}` : ""}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">{formatCurrency(i.amount)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
