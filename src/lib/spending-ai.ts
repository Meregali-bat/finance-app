import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { Refusal } from "@/lib/action-result";
import { SLICES, SLICE_KEYS, type SliceKey } from "@/lib/slices";

/** O modelo da análise de gastos. Mais barato: "claude-sonnet-5-5". */
export const INSIGHT_MODEL = "claude-opus-5-5";

const sliceKey = z.enum(SLICE_KEYS as [SliceKey, ...SliceKey[]]);

const schema = z.object({
  summary: z.string(),
  newCategories: z.array(z.object({ name: z.string(), slice: sliceKey })),
  assignments: z.array(z.object({ group: z.string(), category: z.string() })),
  proposal: z.object({
    freedom: z.number(),
    fixed: z.number(),
    comfort: z.number(),
    goals: z.number(),
    pleasure: z.number(),
    knowledge: z.number(),
    why: z.string(),
  }),
  tips: z.array(
    z.object({ title: z.string(), detail: z.string(), savingPerPeriod: z.number() }),
  ),
});

export type SpendingAiResult = z.infer<typeof schema>;

export interface SpendingAiInput {
  periods: number;
  /** A renda média por período. */
  income: number;
  categories: { name: string; slice: SliceKey }[];
  current: Record<SliceKey, number> | null;
  /** O gasto já categorizado, somado por categoria, no intervalo todo. */
  byCategory: { name: string; slice: SliceKey; total: number; count: number }[];
  /** O que falta categorizar. `group` é a chave que a resposta deve repetir. */
  groups: { group: string; description: string; count: number; total: number }[];
  smallTotal: number;
  /** O guardado nas caixinhas no intervalo, por fatia. */
  saved: { slice: SliceKey; total: number }[];
}

const SYSTEM = `Você ajuda uma pessoa no Brasil a dividir a renda em seis fatias, no app de orçamento dela. As fatias:
${SLICES.map((s) => `- ${s.key} ("${s.name}"${s.saving ? ", de guardar" : ""}): ${s.hint}`).join("\n")}

Você recebe os gastos reais dela num intervalo de alguns períodos de pagamento (de um salário ao outro). Responda em português do Brasil, direto e em segunda pessoa, sempre com os números dela.

1. assignments: para cada grupo de "groups" (gastos sem categoria ou em "Outros"), escolha uma categoria. Use uma categoria existente quando servir; crie uma nova em newCategories só quando ela ajudar a ver para onde o dinheiro vai (ex.: "Restaurantes", "Farmácia", "Assinaturas", "Combustível"), com a fatia certa. Repita a chave "group" exatamente. Pule o grupo se não der para saber o que é pelo nome.
2. proposal: porcentagens inteiras da renda para cada fatia, somando 100. Parta do que ela gasta hoje: custos fixos que não dá para cortar precisam caber; reserve algo para as fatias de guardar mesmo que hoje seja zero, mas de forma realista. why: uma ou duas frases.
3. tips: até 5 dicas concretas de onde reduzir, cada uma citando o gasto real (estabelecimento ou categoria e o valor por período) e quanto economizaria por período em reais. Nada genérico.
4. summary: duas ou três frases sobre o retrato de hoje.

Valores em reais estão "por período" quando a dica falar de período: divida o total do intervalo pelo número de períodos.`;

export async function askSpendingInsight(input: SpendingAiInput): Promise<SpendingAiResult> {
  const client = new Anthropic();
  const response = await client.messages.parse({
    model: INSIGHT_MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium", format: zodOutputFormat(schema) },
    system: SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(input) }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Refusal("A IA não conseguiu analisar agora. Tente de novo.");
  }
  return response.parsed_output;
}
