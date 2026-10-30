"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { Refusal, refusing } from "@/lib/action-result";
import { loadBudgetInputs } from "@/lib/budget-inputs";
import { loadHistoryItems } from "@/lib/history-items";
import { countsAsReceived, countsAsSpending, ownSpending } from "@/lib/report-totals";
import { getPeriodBoundsDetailed } from "@/lib/period";
import { normalizeName } from "@/lib/shortcut";
import { SLICE_KEYS, isSliceKey, sliceOfCategory, type SliceKey, type SlicePercents } from "@/lib/slices";
import {
  categoryTotals,
  closeProposal,
  groupOpenSpending,
  sliceSnapshot,
  type CategoryInfo,
  type SpendItem,
} from "@/lib/spending-insight";
import { askSpendingInsight } from "@/lib/spending-ai";
import { saveSlices } from "@/lib/actions/slices";

export interface InsightGroup {
  key: string;
  description: string;
  count: number;
  total: number;
  category: string;
  slice: SliceKey;
  /** A categoria ainda não existe: Aplicar cria. */
  isNew: boolean;
  /** Os lançamentos e compras que Aplicar muda; contas fixas e assinaturas mudam em Fixos. */
  items: { kind: "transaction" | "card"; id: string }[];
  elsewhere: number;
}

export interface InsightAnalysis {
  analyzedAt: string;
  range: { start: string; end: string };
  periods: number;
  summary: string;
  snapshot: ReturnType<typeof sliceSnapshot>;
  proposal: SlicePercents;
  proposalWhy: string;
  tips: { title: string; detail: string; savingPerPeriod: number }[];
  groups: InsightGroup[];
}

const DAY = 86_400_000;
const utcMidnight = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Os 3 períodos de pagamento antes do atual (o atual está pela metade), pela
 * régua das rendas como no Histórico. Sem ciclo, os últimos 90 dias em 3
 * "períodos" de 30.
 */
async function analysisRange(userId: string, today: Date) {
  const inputs = await loadBudgetInputs(userId);
  const payRule = inputs.incomes.map((i) => ({ ...i, createdAt: new Date(0) }));
  const current = getPeriodBoundsDetailed(payRule, today, inputs.incomeReceipts);
  if (!current.fallback) {
    let start = current.periodStart;
    let periods = 0;
    while (periods < 3) {
      const previous = getPeriodBoundsDetailed(
        payRule,
        new Date(start.getTime() - DAY),
        inputs.incomeReceipts,
      );
      if (previous.fallback) break;
      start = previous.periodStart;
      periods++;
    }
    if (periods > 0) return { rangeStart: start, rangeEnd: current.periodStart, periods };
  }
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return { rangeStart: new Date(end.getTime() - 90 * DAY), rangeEnd: end, periods: 3 };
}

/**
 * Manda os gastos dos últimos períodos para a IA e devolve a categorização
 * sugerida, o retrato por fatia e a proposta. Não grava nada.
 */
export async function analyzeSpending() {
  return refusing(async (): Promise<InsightAnalysis> => {
    const userId = await requireUserId();
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Refusal("A análise com IA não está configurada (falta ANTHROPIC_API_KEY).");
    }
    const today = new Date();
    const { rangeStart, rangeEnd, periods } = await analysisRange(userId, today);
    const [{ items }, categoryRows, deposits, user] = await Promise.all([
      loadHistoryItems(userId, {
        rangeStart,
        rangeEnd,
        utcRangeStart: utcMidnight(rangeStart),
        utcRangeEnd: utcMidnight(rangeEnd),
      }),
      prisma.category.findMany({ where: { userId }, select: { id: true, name: true, slice: true, active: true } }),
      prisma.jarDeposit.findMany({
        where: { userId, plannedWithdrawalAt: null, createdAt: { gte: rangeStart, lt: rangeEnd } },
        select: { amount: true, jar: { select: { slice: true } } },
      }),
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { budgetSlices: true } }),
    ]);

    const income = items.filter(countsAsReceived).reduce((sum, i) => sum - i.amount, 0);
    if (income <= 0) {
      throw new Refusal("Confirme uma renda para a IA comparar seus gastos com ela.");
    }
    const spend: SpendItem[] = items
      .filter((i) => countsAsSpending(i) && ownSpending(i) > 0)
      .map((i) => ({
        kind: i.kind,
        id: i.id,
        description: i.description,
        amount: ownSpending(i),
        categoryId: i.categoryId,
        slice: i.slice ?? null,
      }));
    if (spend.length === 0) throw new Refusal("Não há gastos nos últimos períodos para analisar.");

    const categoriesById = new Map<string, CategoryInfo>(
      categoryRows.map((c) => [c.id, { id: c.id, name: c.name, slice: sliceOfCategory(c) }]),
    );
    const { groups, smallTotal } = groupOpenSpending(spend, categoriesById);
    const savedBySlice = new Map<SliceKey, number>();
    for (const d of deposits) {
      const slice: SliceKey = d.jar.slice === "goals" ? "goals" : "freedom";
      savedBySlice.set(slice, (savedBySlice.get(slice) ?? 0) + Number(d.amount));
    }
    const saved = [...savedBySlice].map(([slice, total]) => ({ slice, total }));
    const current = user.budgetSlices as Record<SliceKey, number> | null;

    const ai = await askSpendingInsight({
      periods,
      income: Math.round((income / periods) * 100) / 100,
      categories: categoryRows
        .filter((c) => c.active)
        .map((c) => ({ name: c.name, slice: categoriesById.get(c.id)!.slice })),
      current,
      byCategory: categoryTotals(spend, categoriesById),
      groups: groups.map((g) => ({ group: g.key, description: g.description, count: g.count, total: g.total })),
      smallTotal,
      saved,
    });

    // Só vale categoria que existe ou que a IA criou; o resto fica sem sugestão.
    const existing = new Map(categoryRows.map((c) => [normalizeName(c.name), categoriesById.get(c.id)!]));
    const created = new Map(
      ai.newCategories
        .filter((c) => c.name.trim() && !existing.has(normalizeName(c.name)))
        .map((c) => [normalizeName(c.name), { name: c.name.trim().slice(0, 60), slice: c.slice }]),
    );
    const groupByKey = new Map(groups.map((g) => [g.key, g]));
    const insightGroups: InsightGroup[] = [];
    for (const a of ai.assignments) {
      const group = groupByKey.get(a.group);
      const name = normalizeName(a.category);
      const target = existing.get(name) ?? created.get(name);
      if (!group || !target || name === "outros") continue;
      groupByKey.delete(a.group);
      const editable = new Map<string, { kind: "transaction" | "card"; id: string }>();
      for (const item of group.items) {
        if (item.kind === "transaction" || item.kind === "card") {
          editable.set(`${item.kind}:${item.id}`, { kind: item.kind, id: item.id });
        }
      }
      insightGroups.push({
        key: group.key,
        description: group.description,
        count: group.count,
        total: group.total,
        category: target.name,
        slice: target.slice,
        isNew: !existing.has(name),
        items: [...editable.values()],
        elsewhere: group.items.filter((i) => i.kind !== "transaction" && i.kind !== "card").length,
      });
    }
    insightGroups.sort((a, b) => b.total - a.total);

    return {
      analyzedAt: today.toISOString(),
      range: { start: isoDay(rangeStart), end: isoDay(new Date(rangeEnd.getTime() - DAY)) },
      periods,
      summary: ai.summary,
      snapshot: sliceSnapshot({
        items: spend,
        categoriesById,
        suggestedSlice: new Map(insightGroups.map((g) => [g.key, g.slice])),
        saved: saved.map((s) => ({ slice: s.slice, amount: s.total })),
        income,
        periods,
      }),
      proposal: closeProposal(ai.proposal),
      proposalWhy: ai.proposal.why,
      tips: ai.tips.slice(0, 5),
      groups: insightGroups,
    };
  });
}

const applySchema = z.object({
  categoryName: z.string().trim().min(1).max(60),
  slice: z.enum(SLICE_KEYS as [SliceKey, ...SliceKey[]]),
  items: z
    .array(z.object({ kind: z.enum(["transaction", "card"]), id: z.string().min(1) }))
    .max(1000),
});

/**
 * Aplica a categoria sugerida a um grupo. A categoria nova é criada com a
 * fatia sugerida (ou reaproveitada, se já existir com esse nome). Só muda o
 * que ainda está sem categoria ou em "Outros".
 */
export async function applyCategoryGroup(input: unknown) {
  return refusing(async () => {
    const userId = await requireUserId();
    const { categoryName, slice, items } = applySchema.parse(input);
    const categories = await prisma.category.findMany({
      where: { userId },
      select: { id: true, name: true, active: true },
    });
    const found = categories.find((c) => normalizeName(c.name) === normalizeName(categoryName));
    const category = found
      ? found.active
        ? found
        : await prisma.category.update({ where: { id: found.id }, data: { active: true } })
      : await prisma.category.create({ data: { userId, name: categoryName, slice } });
    const open = {
      OR: [
        { categoryId: null },
        { categoryId: { in: categories.filter((c) => normalizeName(c.name) === "outros").map((c) => c.id) } },
      ],
    };
    const ids = (kind: "transaction" | "card") => items.filter((i) => i.kind === kind).map((i) => i.id);
    const [transactions, purchases] = await prisma.$transaction([
      prisma.transaction.updateMany({
        where: { userId, id: { in: ids("transaction") }, ...open },
        data: { categoryId: category.id },
      }),
      prisma.cardPurchase.updateMany({
        where: { userId, id: { in: ids("card") }, ...open },
        data: { categoryId: category.id },
      }),
    ]);
    revalidatePath("/", "layout");
    return { updated: transactions.count + purchases.count };
  });
}

/** "Usar esta proposta": grava só as porcentagens; as categorias e caixinhas ficam como estão. */
export async function adoptProposal(input: unknown) {
  return refusing(async () => {
    const raw = z.record(z.string(), z.number()).parse(input);
    const percents = closeProposal(
      Object.fromEntries(Object.entries(raw).filter(([k]) => isSliceKey(k))) as Partial<
        Record<SliceKey, number>
      >,
    );
    await saveSlices({ percents, categories: [], jars: [] });
    return { ok: true as const };
  });
}
