import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { Refusal } from "@/lib/action-result";
import type { AppRecord, RawIssue } from "@/lib/statement/review-issues";

/** O modelo da conferência de extrato. Mais barato: "claude-sonnet-5-5". */
export const REVIEW_MODEL = "claude-opus-5-5";

const schema = z.object({
  issues: z.array(
    z.object({
      kind: z.enum(["amount", "ownTransfer", "duplicate", "direction", "other"]),
      transactionId: z.string().nullable(),
      statementDate: z.string().nullable(),
      statementDescription: z.string().nullable(),
      statementAmount: z.number().nullable(),
      explanation: z.string(),
    }),
  ),
});

const SYSTEM = `Você confere a importação de um extrato bancário brasileiro num app de orçamento. Recebe o PDF do extrato e a lista de lançamentos que o app tem no período (amount assinado: positivo = saiu dinheiro, negativo = entrou). A importação do app pode ter errado; leia o extrato você mesmo, com cuidado, e aponte só problemas reais nos lançamentos do app:

- "amount": o lançamento corresponde a uma movimentação do extrato, mas o valor é outro. statementAmount = o valor do extrato, sem sinal.
- "ownTransfer": o lançamento é uma transferência entre contas da própria pessoa (mesmo titular dos dois lados, inclusive a conta PJ/MEI dela e a PF), lançada como gasto ou receita. Isso não é gasto nem renda.
- "duplicate": o mesmo movimento do extrato aparece duas vezes no app; aponte só o repetido.
- "direction": entrada lançada como saída, ou o contrário.
- "other": outro problema que você tenha certeza; explique. transactionId pode ser nulo.

Para cada problema, transactionId é o id exato da lista; statementDate ("YYYY-MM-DD") e statementDescription vêm da linha do extrato. explanation: uma frase em português, em segunda pessoa, com os dois valores. Lançamentos do app que não estão no extrato não são problema (podem ser de outra conta). Se estiver tudo certo, devolva issues vazio.`;

export async function askStatementReview(input: {
  pdfBase64: string;
  records: AppRecord[];
  hint: string | null;
}): Promise<RawIssue[]> {
  const client = new Anthropic();
  const response = await client.messages.parse({
    model: REVIEW_MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium", format: zodOutputFormat(schema) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: input.pdfBase64 },
          },
          {
            type: "text",
            text:
              `Lançamentos do app no período:\n${JSON.stringify(input.records)}` +
              (input.hint ? `\n\nO que a pessoa acha que está errado: ${input.hint}` : ""),
          },
        ],
      },
    ],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Refusal("A IA não conseguiu conferir agora. Tente de novo.");
  }
  return response.parsed_output.issues;
}
