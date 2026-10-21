import { normalizeName } from "@/lib/shortcut";

/**
 * As fatias da renda: quanto de cada período vai para cada destino. As de
 * guardar (Metas, Liberdade financeira) saem do "quanto posso gastar hoje"; as
 * de gastar só mostram quanto já foi usado do limite. Puro e testado.
 */

export type SliceKey = "freedom" | "fixed" | "comfort" | "goals" | "pleasure" | "knowledge";

export interface SliceInfo {
  key: SliceKey;
  name: string;
  /** Guardar (sai do número do dia) ou gastar (só acompanha). */
  saving: boolean;
  /** Cor da fatia, um token do tema. */
  color: string;
  hint: string;
}

export const SLICES: SliceInfo[] = [
  {
    key: "freedom",
    name: "Liberdade financeira",
    saving: true,
    color: "var(--slice-freedom)",
    hint: "O que você guarda para o futuro",
  },
  {
    key: "fixed",
    name: "Custos fixos",
    saving: false,
    color: "var(--slice-fixed)",
    hint: "Moradia, contas, saúde, transporte",
  },
  {
    key: "comfort",
    name: "Conforto",
    saving: false,
    color: "var(--slice-comfort)",
    hint: "Mercado, o dia a dia que deixa a vida melhor",
  },
  {
    key: "goals",
    name: "Metas",
    saving: true,
    color: "var(--slice-goals)",
    hint: "Guardar para algo: viagem, troca de carro",
  },
  {
    key: "pleasure",
    name: "Prazeres",
    saving: false,
    color: "var(--slice-pleasure)",
    hint: "Lazer, restaurantes, presentes",
  },
  {
    key: "knowledge",
    name: "Conhecimento",
    saving: false,
    color: "var(--slice-knowledge)",
    hint: "Cursos, livros, estudo",
  },
];

export const SLICE_KEYS = SLICES.map((s) => s.key);

export type SlicePercents = Record<SliceKey, number>;

/** O ponto de partida: a divisão do método dos seis potes. */
export const DEFAULT_SLICES: SlicePercents = {
  freedom: 25,
  fixed: 30,
  comfort: 15,
  goals: 15,
  pleasure: 10,
  knowledge: 5,
};

export function isSliceKey(value: unknown): value is SliceKey {
  return typeof value === "string" && (SLICE_KEYS as string[]).includes(value);
}

/**
 * As porcentagens guardadas no usuário, se válidas: inteiras, de 0 a 100,
 * somando exatamente 100. Qualquer outra coisa é "não configurado".
 */
export function parseSlices(value: unknown): SlicePercents | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const percents = {} as SlicePercents;
  for (const key of SLICE_KEYS) {
    const n = record[key];
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 100) return null;
    percents[key] = n;
  }
  return sumPercents(percents) === 100 ? percents : null;
}

export function sumPercents(percents: SlicePercents): number {
  return SLICE_KEYS.reduce((sum, key) => sum + percents[key], 0);
}

/** Quanto da renda vai para as fatias de guardar. */
export function savingPercent(percents: SlicePercents): number {
  return SLICES.filter((s) => s.saving).reduce((sum, s) => sum + percents[s.key], 0);
}

const CATEGORY_DEFAULTS: [RegExp, SliceKey][] = [
  [/moradia|aluguel|condominio|casa|luz|agua|energia|internet|celular|telefone|conta/, "fixed"],
  [/saude|farmacia|medic|plano|seguro/, "fixed"],
  [/transporte|combustivel|gasolina|uber|onibus|carro/, "fixed"],
  [/educacao|curso|livro|estudo|faculdade|escola/, "knowledge"],
  [/lazer|restaurante|bar|viagem|presente|cinema|streaming|diversao/, "pleasure"],
  [/alimentacao|mercado|supermercado|comida|padaria/, "comfort"],
];

/**
 * A fatia de uma categoria: a que a pessoa escolheu, ou um palpite pelo nome.
 * Sem palpite, Conforto — o gasto do dia a dia que não é conta nem lazer.
 */
export function sliceOfCategory(category: { name: string; slice?: string | null }): SliceKey {
  if (isSliceKey(category.slice)) return category.slice;
  const name = normalizeName(category.name);
  return CATEGORY_DEFAULTS.find(([pattern]) => pattern.test(name))?.[1] ?? "comfort";
}

export interface SavingReserve {
  /** O que o período deveria guardar: a renda vezes as fatias de guardar. */
  target: number;
  /** O que já foi para as caixinhas no período (o resgatado desconta). */
  saved: number;
  /** O que ainda falta guardar. */
  remaining: number;
  /** Quanto disso de fato sai do número do dia — nunca mais do que há. */
  applied: number;
  /** O que não coube: o período não fecha com a reserva inteira. */
  shortfall: number;
}

/**
 * Quanto do dinheiro livre do período fica reservado para guardar. O que já
 * está nas caixinhas não conta de novo — ele já saiu do saldo. E a reserva
 * nunca deixa o número do dia negativo: o que não couber vira aviso.
 */
export function savingReserve(input: {
  income: number;
  percents: SlicePercents;
  saved: number;
  /** O livre do período antes da reserva (o número do dia vezes os dias). */
  spendable: number;
}): SavingReserve {
  const target = round(Math.max(0, input.income) * (savingPercent(input.percents) / 100));
  const saved = round(Math.max(0, input.saved));
  const remaining = round(Math.max(0, target - saved));
  const applied = round(Math.min(remaining, Math.max(0, input.spendable)));
  return { target, saved, remaining, applied, shortfall: round(remaining - applied) };
}

export interface SliceUsage {
  key: SliceKey;
  /** O previsto: a fatia da renda do período. */
  limit: number;
  /** Gasto (ou guardado, nas de guardar) no período. */
  used: number;
  /** 0 a 100+, sem teto: passar do limite tem que aparecer. */
  percentUsed: number;
  count: number;
}

/** Quanto cada fatia já usou do seu pedaço da renda do período. */
export function sliceUsage(input: {
  income: number;
  percents: SlicePercents;
  /** O gasto do período, já com a fatia de cada um. */
  spending: { slice: SliceKey; amount: number }[];
  /** O guardado nas caixinhas, com a fatia de cada caixinha. */
  saved: { slice: SliceKey; amount: number }[];
}): SliceUsage[] {
  return SLICES.map(({ key, saving }) => {
    const rows = (saving ? input.saved : input.spending).filter((r) => r.slice === key);
    const used = round(rows.reduce((sum, r) => sum + r.amount, 0));
    const limit = round(Math.max(0, input.income) * (input.percents[key] / 100));
    return {
      key,
      limit,
      used,
      percentUsed: limit > 0 ? Math.round((used / limit) * 1000) / 10 : used > 0 ? 100 : 0,
      count: rows.length,
    };
  });
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Uma compra fez uma fatia de gastar passar de 90% do previsto? Compara o uso
 * de agora com o de antes dela; só avisa na travessia, não a cada compra
 * depois.
 */
export function crossedNinety(usage: SliceUsage, amount: number): boolean {
  if (usage.limit <= 0) return false;
  const before = ((usage.used - amount) / usage.limit) * 100;
  return usage.percentUsed >= 90 && before < 90;
}
