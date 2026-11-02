import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { Refusal } from "@/lib/action-result";

/** O modelo da conferência de fatura. Mais barato: "claude-sonnet-5-5". */
export const BILL_CHECK_MODEL = "claude-opus-5-5";

const schema = z.object({
  summary: z.string(),
  findings: z.array(
    z.object({
      kind: z.enum(["estimate", "duplicate", "subscription", "bank_difference", "other"]),
      explanation: z.string(),
      estimateId: z.string().nullable(),
      purchaseId: z.string().nullable(),
    }),
  ),
});

export type BillAiFinding = z.infer<typeof schema>["findings"][number];

export interface BillCheckInput {
  card: { name: string; closingDay: number; dueDay: number };
  today: string;
  bill: {
    dueDate: string;
    cycleStart: string;
    cycleEnd: string;
    total: number;
    purchases: number;
    subscriptions: number;
    estimates: number;
  };
  purchases: {
    id: string;
    description: string;
    date: string;
    createdAt: string | null;
    amount: number;
    installment: string | null;
  }[];
  subscriptions: { label: string; amount: number }[];
  /** Todas as previsões das faturas em aberto, com o mês de cada uma. */
  estimates: { id: string; description: string; amount: number; dueDate: string; createdAt: string }[];
  /** A última conferência pelas prints do banco, se houver. */
  prints: { from: string; to: string; total: number } | null;
}

const SYSTEM = `Você confere a próxima fatura de um cartão de crédito num app de orçamento brasileiro. A fatura do app = compras (parcela de cada compra que cai no ciclo) + assinaturas cobradas no cartão + previsões (ajustes que a pessoa lança à mão numa fatura, como um ajuste de saldo; elas SOMAM ao total e são legítimas).

Aponte só problemas prováveis, cada um com uma frase em português, em segunda pessoa, com valores e datas:
- "estimate": uma previsão que parece estar na fatura errada (por exemplo, criada junto de outras para meses seguintes e caindo nesta fatura, ou com a mesma descrição e valor das previsões de outros meses quando esta fatura já tem as compras de verdade). estimateId = o id exato.
- "duplicate": a mesma compra lançada duas vezes (mesma descrição ou estabelecimento, mesmo valor, datas iguais ou muito próximas). purchaseId = o id da repetida (a mais recente).
- "subscription": só comente, sem pedir correção, se uma assinatura parece repetir uma compra lançada. A pessoa disse que as assinaturas estão certas: não insista.
- "bank_difference": se houver o total das prints do banco, compare com as compras do app no mesmo período e explique a diferença.
- "other": outra coisa que você tenha certeza.
Use só ids da lista. Se estiver tudo certo, findings vazio. summary: duas frases explicando de onde vem o total da fatura.`;

export async function askBillCheck(input: BillCheckInput) {
  const client = new Anthropic();
  const response = await client.messages.parse({
    model: BILL_CHECK_MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium", format: zodOutputFormat(schema) },
    system: SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(input) }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Refusal("A IA não conseguiu conferir agora. Tente de novo.");
  }
  return response.parsed_output;
}
