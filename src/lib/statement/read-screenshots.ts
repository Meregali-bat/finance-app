import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { Refusal } from "@/lib/action-result";
import type { RawShotLine } from "@/lib/statement/card-screenshots";

/**
 * Lê as prints da tela "Lançamentos" do app do banco com o Claude. Trocar por
 * "claude-sonnet-5-5" ou "claude-haiku-5-5" barateia a leitura (Haiku erra
 * mais nos valores riscados).
 */
export const SCREENSHOT_MODEL = "claude-opus-5-5";

export type ShotImage = { mediaType: "image/jpeg" | "image/png" | "image/webp"; data: string };

const schema = z.object({
  lines: z.array(
    z.object({
      description: z.string(),
      day: z.number().int(),
      month: z.number().int(),
      time: z.string(),
      amount: z.number(),
      status: z.enum(["processado", "pendente", "negado", "cancelado", "desconhecido"]),
      kind: z.enum(["compra", "outro"]),
    }),
  ),
});

const PROMPT = `Estas são prints, em ordem, da tela de lançamentos do cartão de crédito no app de um banco brasileiro. As prints se sobrepõem: a mesma linha pode aparecer em mais de uma.

Transcreva cada lançamento que aparece, sem pular nenhum, mesmo os repetidos entre prints:
- description: o nome exatamente como está na tela (ex.: "BMB      *VERO" vira "BMB *VERO").
- day e month: do texto de data, como "29 OCT" (mês em inglês ou português; month de 1 a 12).
- time: a hora "HH:MM".
- amount: o valor em reais, positivo (R$ 1.234,56 → 1234.56).
- status: "negado" se tiver o selo Negado; "cancelado" se tiver Cancelado; "desconhecido" se tiver Desconhecido; "pendente" se tiver Pendente; "processado" se não tiver selo. Valor riscado sempre vem com um desses selos.
- kind: "compra" para compras; "outro" para pagamento de fatura, estorno, crédito ou ajuste.

Ignore cabeçalhos, filtros, abas e notificações sobrepostas. Se uma linha estiver cortada na borda da print e não der para ler o valor ou a data, pule-a.`;

export async function readCardScreenshots(images: ShotImage[]): Promise<RawShotLine[]> {
  const client = new Anthropic();
  const response = await client.messages.parse({
    model: SCREENSHOT_MODEL,
    max_tokens: 16000,
    output_config: { effort: "low", format: zodOutputFormat(schema) },
    messages: [
      {
        role: "user",
        content: [
          ...images.map((image) => ({
            type: "image" as const,
            source: { type: "base64" as const, media_type: image.mediaType, data: image.data },
          })),
          { type: "text" as const, text: PROMPT },
        ],
      },
    ],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Refusal("Não consegui ler as prints. Tente de novo.");
  }
  return response.parsed_output.lines;
}
