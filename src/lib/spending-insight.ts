import { normalizeName } from "@/lib/shortcut";
import { SLICES, SLICE_KEYS, isSliceKey, type SliceKey, type SlicePercents } from "@/lib/slices";

/**
 * Montar as Metas com a IA: o que dá para fazer sem ela, puro e testado.
 * Agrupar o gasto que falta categorizar (é o que a IA recebe), calcular o
 * retrato de hoje por fatia e fechar a proposta dela em 100%.
 */

/** Um gasto do intervalo analisado, já só a parte da pessoa (sem o emprestado). */
export interface SpendItem {
  kind: string;
  id: string;
  description: string;
  amount: number;
  categoryId: string | null;
  /** A fatia escolhida no próprio lançamento, que vale mais que a da categoria. */
  slice: string | null;
}

export interface CategoryInfo {
  id: string;
  name: string;
  slice: SliceKey;
}

export interface SpendGroup {
  /** A descrição normalizada: o que junta "FRUTOS DA TERRA" e "Frutos da Terra". */
  key: string;
  description: string;
  count: number;
  total: number;
  items: { kind: string; id: string }[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Sem categoria ou em "Outros": o que a IA pode categorizar. */
export function isOpenItem(item: SpendItem, categoriesById: Map<string, CategoryInfo>): boolean {
  if (!item.categoryId) return true;
  const category = categoriesById.get(item.categoryId);
  return !category || normalizeName(category.name) === "outros";
}

/** Os gastos abertos agrupados pela descrição, os maiores primeiro; o que passa do limite vira um total. */
export function groupOpenSpending(
  items: SpendItem[],
  categoriesById: Map<string, CategoryInfo>,
  limit = 300,
): { groups: SpendGroup[]; smallTotal: number } {
  const byKey = new Map<string, SpendGroup>();
  for (const item of items) {
    if (!isOpenItem(item, categoriesById)) continue;
    const key = normalizeName(item.description) || "sem descricao";
    const group = byKey.get(key) ?? {
      key,
      description: item.description.trim(),
      count: 0,
      total: 0,
      items: [],
    };
    group.count++;
    group.total = round2(group.total + item.amount);
    group.items.push({ kind: item.kind, id: item.id });
    byKey.set(key, group);
  }
  const sorted = [...byKey.values()].sort((a, b) => b.total - a.total);
  return {
    groups: sorted.slice(0, limit),
    smallTotal: round2(sorted.slice(limit).reduce((sum, g) => sum + g.total, 0)),
  };
}

/** O gasto já categorizado, somado por categoria: o contexto que a IA recebe. */
export function categoryTotals(items: SpendItem[], categoriesById: Map<string, CategoryInfo>) {
  const byName = new Map<string, { name: string; slice: SliceKey; total: number; count: number }>();
  for (const item of items) {
    if (isOpenItem(item, categoriesById)) continue;
    const category = categoriesById.get(item.categoryId!)!;
    const row = byName.get(category.id) ?? { name: category.name, slice: category.slice, total: 0, count: 0 };
    row.total = round2(row.total + item.amount);
    row.count++;
    byName.set(category.id, row);
  }
  return [...byName.values()].sort((a, b) => b.total - a.total);
}

/**
 * Quanto foi, por período, para cada fatia: as regras das Metas (a fatia do
 * lançamento, senão a da categoria), com os grupos sem categoria indo para a
 * fatia que a IA sugeriu. As de guardar vêm das caixinhas. O que sobrou da
 * renda (ou faltou, negativo) fica em `leftover`.
 */
export function sliceSnapshot(input: {
  items: SpendItem[];
  categoriesById: Map<string, CategoryInfo>;
  suggestedSlice: Map<string, SliceKey>;
  saved: { slice: SliceKey; amount: number }[];
  income: number;
  periods: number;
}) {
  const periods = Math.max(1, input.periods);
  const totals = new Map<SliceKey, number>(SLICE_KEYS.map((k) => [k, 0]));
  let uncategorized = 0;
  for (const item of input.items) {
    const own = isSliceKey(item.slice) ? item.slice : null;
    const category = item.categoryId ? input.categoriesById.get(item.categoryId) : undefined;
    const suggested = isOpenItem(item, input.categoriesById)
      ? input.suggestedSlice.get(normalizeName(item.description) || "sem descricao")
      : undefined;
    const slice = own ?? suggested ?? category?.slice;
    if (slice) totals.set(slice, totals.get(slice)! + item.amount);
    else uncategorized += item.amount;
  }
  for (const s of input.saved) totals.set(s.slice, totals.get(s.slice)! + s.amount);

  const incomePerPeriod = round2(input.income / periods);
  const slices = SLICE_KEYS.map((key) => {
    const perPeriod = round2(totals.get(key)! / periods);
    return {
      key,
      perPeriod,
      percent: incomePerPeriod > 0 ? Math.round((perPeriod / incomePerPeriod) * 1000) / 10 : 0,
    };
  });
  const uncategorizedPerPeriod = round2(uncategorized / periods);
  const used = slices.reduce((sum, s) => sum + s.perPeriod, 0) + uncategorizedPerPeriod;
  return {
    slices,
    uncategorized: uncategorizedPerPeriod,
    leftover: round2(incomePerPeriod - used),
    incomePerPeriod,
  };
}

/**
 * A proposta da IA como as Metas aceitam: inteiros de 0 a 100 somando 100. A
 * diferença vai para a maior fatia de gastar (e, se ela não der conta de um
 * excesso, para a seguinte).
 */
export function closeProposal(raw: Partial<Record<SliceKey, number>>): SlicePercents {
  const percents = Object.fromEntries(
    SLICE_KEYS.map((k) => [k, Math.min(100, Math.max(0, Math.round(raw[k] ?? 0)))]),
  ) as SlicePercents;
  let diff = 100 - SLICE_KEYS.reduce((sum, k) => sum + percents[k], 0);
  const spending = SLICES.filter((s) => !s.saving)
    .map((s) => s.key)
    .sort((a, b) => percents[b] - percents[a]);
  for (const key of spending) {
    if (diff === 0) break;
    const next = Math.max(0, percents[key] + diff);
    diff -= next - percents[key];
    percents[key] = next;
  }
  return percents;
}
