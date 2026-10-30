"use client";

import { startTransition, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Lightbulb, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { homeCard } from "@/components/home-card";
import { SectionLabel } from "@/components/page-header";
import {
  adoptProposal,
  analyzeSpending,
  applyCategoryGroup,
  type InsightAnalysis,
  type InsightGroup,
} from "@/lib/actions/spending-insight";
import { unwrap } from "@/lib/action-result";
import { SLICES, SLICE_KEYS } from "@/lib/slices";
import { errorMessage } from "@/lib/error-message";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

/** A última análise fica no aparelho: sair e voltar não pede (nem paga) outra. */
type Saved = { analysis: InsightAnalysis; applied: string[] };
const STORAGE_KEY = "spending-insight:v1";

function load(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

function store(saved: Saved) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Sem armazenamento (aba anônima): a análise vale enquanto a tela está aberta.
  }
}

/** "2026-10-07" → "07/10". */
const shortDay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const sliceName = (key: string) => SLICES.find((s) => s.key === key)?.name ?? key;

/**
 * Montar as Metas com a IA: categorizar o gasto que falta, ver para onde a
 * renda vai hoje e usar a divisão proposta. Nada é gravado sem um toque.
 */
export function SpendingInsight() {
  const router = useRouter();
  const [saved, setSaved] = useState<Saved | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, startAnalyzing] = useTransition();
  const [saving, startSaving] = useTransition();

  // Lido depois de montar: no servidor não existe localStorage.
  useEffect(() => {
    const previous = load();
    if (previous) startTransition(() => setSaved(previous));
  }, []);

  function update(next: Saved) {
    setSaved(next);
    store(next);
  }

  function analyze() {
    setError(null);
    startAnalyzing(async () => {
      try {
        update({ analysis: unwrap(await analyzeSpending()), applied: [] });
      } catch (e) {
        setError(errorMessage(e, "Não deu para analisar agora. Tente de novo."));
      }
    });
  }

  function apply(groups: InsightGroup[]) {
    if (!saved) return;
    setError(null);
    startSaving(async () => {
      try {
        for (const group of groups) {
          unwrap(
            await applyCategoryGroup({
              categoryName: group.category,
              slice: group.slice,
              items: group.items,
            }),
          );
        }
        update({
          ...saved,
          applied: [...saved.applied, ...groups.map((g) => g.key)],
        });
        router.refresh();
      } catch (e) {
        setError(errorMessage(e, "Não deu para aplicar. Tente de novo."));
      }
    });
  }

  function adopt() {
    if (!saved) return;
    setError(null);
    startSaving(async () => {
      try {
        unwrap(await adoptProposal(saved.analysis.proposal));
        router.push("/metas");
      } catch (e) {
        setError(errorMessage(e, "Não deu para salvar as fatias. Tente de novo."));
      }
    });
  }

  const analysis = saved?.analysis;
  const applied = new Set(saved?.applied ?? []);
  const pending = analysis?.groups.filter((g) => !applied.has(g.key)) ?? [];

  return (
    <div className="flex flex-col gap-5 lg:max-w-2xl">
      <div className={homeCard("flex flex-col items-start gap-3")}>
        <span
          aria-hidden="true"
          className="flex size-11 items-center justify-center rounded-2xl bg-primary/12 text-primary"
        >
          <Sparkles className="size-5" />
        </span>
        <p className="text-sm text-muted-foreground">
          {analysis
            ? `Análise de ${new Date(analysis.analyzedAt).toLocaleDateString("pt-BR")}, com os gastos de ${shortDay(analysis.range.start)} a ${shortDay(analysis.range.end)} (${analysis.periods} ${analysis.periods === 1 ? "período" : "períodos"}).`
            : "A IA olha seus gastos dos últimos períodos, sugere categorias para o que está sem ou em Outros, e propõe como dividir sua renda nas fatias, com dicas de onde cortar."}
        </p>
        <Button type="button" onClick={analyze} disabled={analyzing || saving}>
          {analyzing ? "Analisando..." : analysis ? "Analisar de novo" : "Analisar meus gastos"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Seus gastos desses períodos são enviados para a IA da Anthropic só para esta análise.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}

      {analysis && (
        <>
          <p className="text-[15px]">{analysis.summary}</p>

          {analysis.groups.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SectionLabel>Categorias sugeridas</SectionLabel>
                {pending.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={saving}
                    onClick={() => apply(pending)}
                  >
                    Aplicar todas
                  </Button>
                )}
              </div>
              <ul className="flex flex-col gap-2">
                {analysis.groups.map((group) => {
                  const done = applied.has(group.key);
                  return (
                    <li
                      key={group.key}
                      className={homeCard(
                        cn(
                          "flex flex-wrap items-center gap-x-3 gap-y-2 py-3 pr-3 pl-4 lg:py-3 lg:pr-3 lg:pl-4",
                          done && "opacity-60",
                        ),
                      )}
                    >
                      <div className="min-w-[10rem] flex-1">
                        <p className="truncate text-[15px] font-semibold">{group.description}</p>
                        <p className="text-[13px] text-muted-foreground">
                          {group.category}
                          {group.isNew ? " (nova)" : ""} · {sliceName(group.slice)} · {group.count}{" "}
                          {group.count === 1 ? "gasto" : "gastos"}
                          {group.elsewhere > 0 ? ` · ${group.elsewhere} em Fixos` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-[15px] font-semibold tabular-nums">
                        {formatCurrency(group.total)}
                      </span>
                      {done ? (
                        <span className="flex items-center gap-1 text-xs font-semibold text-positive">
                          <Check className="size-4" aria-hidden="true" /> Aplicada
                        </span>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          disabled={saving || group.items.length === 0}
                          onClick={() => apply([group])}
                        >
                          Aplicar
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <SectionLabel>Para onde vai sua renda hoje</SectionLabel>
            <div className={homeCard("flex flex-col gap-3")}>
              <p className="text-[13px] text-muted-foreground">
                Média por período, de uma renda de{" "}
                {formatCurrency(analysis.snapshot.incomePerPeriod)}. Já conta as categorias
                sugeridas acima.
              </p>
              <ul className="flex flex-col gap-2.5">
                {SLICES.map((slice) => {
                  const row = analysis.snapshot.slices.find((s) => s.key === slice.key)!;
                  return (
                    <li key={slice.key} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="size-2.5 rounded-full"
                            style={{ background: slice.color }}
                          />
                          {slice.name}
                        </span>
                        <span className="tabular-nums">
                          {formatCurrency(row.perPeriod)}{" "}
                          <span className="text-muted-foreground">
                            · {row.percent.toLocaleString("pt-BR")}%
                          </span>
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-(--track)">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, row.percent)}%`,
                            background: slice.color,
                          }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="text-[13px] text-muted-foreground">
                {analysis.snapshot.uncategorized > 0.005 &&
                  `Sem categoria: ${formatCurrency(analysis.snapshot.uncategorized)}. `}
                {analysis.snapshot.leftover >= 0
                  ? `Sobrou sem destino: ${formatCurrency(analysis.snapshot.leftover)} por período.`
                  : `Faltou: ${formatCurrency(-analysis.snapshot.leftover)} por período além da renda.`}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <SectionLabel>Proposta para as fatias</SectionLabel>
            <div className={homeCard("flex flex-col gap-3")}>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                {SLICES.map((slice) => {
                  const today = analysis.snapshot.slices.find((s) => s.key === slice.key)!.percent;
                  return (
                    <li key={slice.key} className="flex flex-col">
                      <span className="text-[12.5px] text-muted-foreground">{slice.name}</span>
                      <span className="font-heading text-lg font-bold tabular-nums">
                        {analysis.proposal[slice.key]}%
                      </span>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        hoje {Math.round(today)}%
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="text-[13px] text-muted-foreground">{analysis.proposalWhy}</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={adopt} disabled={saving}>
                  {saving ? "Salvando..." : "Usar esta proposta"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    router.push(
                      `/metas/ajustar?proposta=${SLICE_KEYS.map((k) => analysis.proposal[k]).join(",")}`,
                    )
                  }
                >
                  Ajustar à mão
                </Button>
              </div>
            </div>
          </div>

          {analysis.tips.length > 0 && (
            <div className="flex flex-col gap-2">
              <SectionLabel>Onde dá para reduzir</SectionLabel>
              <ul className="flex flex-col gap-2">
                {analysis.tips.map((tip) => (
                  <li key={tip.title} className={homeCard("flex items-start gap-3")}>
                    <Lightbulb className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                    <div className="flex min-w-0 flex-col gap-1">
                      <p className="text-[15px] font-semibold">{tip.title}</p>
                      <p className="text-[13px] text-muted-foreground">{tip.detail}</p>
                      {tip.savingPerPeriod > 0 && (
                        <p className="text-[13px] font-medium text-positive tabular-nums">
                          Economia de {formatCurrency(tip.savingPerPeriod)} por período
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
