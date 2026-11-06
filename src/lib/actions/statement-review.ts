"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { withUserAiQuota } from "@/lib/ai-quota-store";
import { Refusal, refusing } from "@/lib/action-result";
import { pdfTextItems } from "@/lib/statement/pdf";
import { parseStatement } from "@/lib/statement/parse";
import { askStatementReview } from "@/lib/statement/ai-review";
import { reviewFixes, type AppRecord, type ReviewIssue } from "@/lib/statement/review-issues";

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Manda o PDF do extrato e os lançamentos do app no período para a IA, que
 * aponta valores errados, transferências entre contas próprias lançadas como
 * gasto ou receita, duplicados e sentido trocado. Não grava nada.
 */
export async function reviewStatementWithAi(formData: FormData) {
  return refusing(async (): Promise<{ issues: ReviewIssue[]; checked: number }> => {
    const userId = await requireUserId();
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Refusal("A conferência com IA não está configurada (falta ANTHROPIC_API_KEY).");
    }
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Refusal("Escolha o PDF do extrato.");
    const hint = String(formData.get("hint") ?? "").trim().slice(0, 500) || null;
    const bytes = new Uint8Array(await file.arrayBuffer());

    // O período pelo leitor do app; se ele não entender o PDF, os últimos 60 dias.
    let from = new Date(Date.now() - 60 * DAY);
    let to = new Date(Date.now() + DAY);
    let bank = "desconhecido";
    try {
      const parsed = parseStatement(await pdfTextItems(bytes.slice()));
      bank = parsed.bank;
      const days = parsed.lines.map((l) => l.date.getTime());
      if (days.length > 0) {
        from = new Date(Math.min(...days) - 3 * DAY);
        to = new Date(Math.max(...days) + 4 * DAY);
      }
    } catch {
      // Sem leitor para esse PDF: a IA lê assim mesmo.
    }

    const transactions = await prisma.transaction.findMany({
      where: { userId, fromPeriodClose: false, date: { gte: from, lt: to } },
      select: { id: true, date: true, description: true, amount: true },
      orderBy: { date: "asc" },
    });
    if (transactions.length === 0) {
      throw new Refusal("Não há lançamentos no app no período desse extrato para conferir.");
    }
    const records: AppRecord[] = transactions.map((t) => ({
      id: t.id,
      date: iso(t.date),
      description: t.description,
      amount: Number(t.amount),
    }));

    const raw = await withUserAiQuota(userId, "statement", () =>
      askStatementReview({
        pdfBase64: Buffer.from(bytes).toString("base64"),
        records,
        hint,
      }),
    );
    const issues = reviewFixes(raw, records);
    // Para o dev: o leitor deste banco deixou passar algo. Aparece nos logs da Vercel.
    if (issues.length > 0) {
      console.warn(
        `[importacao-ia] banco=${bank} problemas=${issues.map((i) => i.kind).join(",")}`,
      );
    }
    return { issues, checked: records.length };
  });
}

const fixSchema = z.object({
  transactionId: z.string().min(1),
  fix: z.discriminatedUnion("type", [
    z.object({ type: z.literal("amount"), amount: z.number().refine((n) => n !== 0) }),
    z.object({ type: z.literal("delete") }),
  ]),
});

/** Aplica a correção que a conferência propôs a um lançamento: trocar o valor ou apagar. */
export async function applyStatementFix(input: unknown) {
  return refusing(async () => {
    const userId = await requireUserId();
    const { transactionId, fix } = fixSchema.parse(input);
    const where = { id: transactionId, userId };
    const { count } =
      fix.type === "delete"
        ? // Leva junto o empréstimo ligado, como apagar pelo Histórico.
          await prisma.transaction.deleteMany({ where })
        : await prisma.transaction.updateMany({ where, data: { amount: fix.amount } });
    if (count === 0) throw new Refusal("Lançamento não encontrado.");
    revalidatePath("/", "layout");
    return { ok: true as const };
  });
}
