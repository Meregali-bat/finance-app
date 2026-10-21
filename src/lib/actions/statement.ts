"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { categoryFromHistory } from "@/lib/category-from-history";
import { pdfTextItems } from "@/lib/statement/pdf";
import { parseNubankStatement } from "@/lib/statement/nubank";
import { localDay, reconcile, utcDay, type AppMovement } from "@/lib/statement/reconcile";

export interface StatementDifference {
  fingerprint: string;
  /** "YYYY-MM-DD". */
  date: string;
  direction: "in" | "out";
  amount: number;
  description: string;
  categoryId: string | null;
}

export type StatementAnalysis =
  | { ok: false; error: string }
  | {
      ok: true;
      period: { start: string; end: string } | null;
      total: number;
      matched: number;
      ownTransfers: number;
      investments: number;
      alreadyIgnored: number;
      /** Pagamentos de fatura sem pagamento marcado no app. */
      unmatchedBills: { date: string; amount: number }[];
      differences: StatementDifference[];
    };

const DAY = 86_400_000;

/**
 * Lê o PDF do extrato e confere com o app. Não grava nada: devolve as
 * diferenças para a pessoa decidir.
 */
export async function analyzeStatement(formData: FormData): Promise<StatementAnalysis> {
  const userId = await requireUserId();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Escolha o PDF do extrato." };
  }
  if (file.type && file.type !== "application/pdf") {
    return { ok: false, error: "O arquivo precisa ser o PDF do extrato." };
  }

  let parsed;
  try {
    parsed = parseNubankStatement(await pdfTextItems(new Uint8Array(await file.arrayBuffer())));
  } catch {
    return { ok: false, error: "Não deu para abrir esse PDF." };
  }
  if (parsed.lines.length === 0) {
    return {
      ok: false,
      error: "Não reconheci movimentações nesse PDF. Ele precisa ser o extrato da conta do Nubank.",
    };
  }

  // Os registros do app num intervalo um pouco maior que o extrato: a
  // conferência aceita alguns dias de diferença.
  const days = parsed.lines.map((l) => l.date.getTime());
  const from = new Date(Math.min(...days) - 4 * DAY);
  const to = new Date(Math.max(...days) + 5 * DAY);
  const [transactions, receipts, payments, jars, ignores] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId, fromPeriodClose: false, date: { gte: from, lt: to } },
      select: { amount: true, date: true },
    }),
    prisma.incomeReceipt.findMany({
      where: { userId, occurrenceDate: { gte: from, lt: to } },
      select: { amount: true, occurrenceDate: true },
    }),
    prisma.expensePayment.findMany({
      where: { userId, paidAt: { gte: from, lt: to } },
      select: { amount: true, paidAt: true, cardId: true },
    }),
    prisma.jarDeposit.findMany({
      where: { userId, fromPeriodClose: false, createdAt: { gte: from, lt: to } },
      select: { amount: true, createdAt: true },
    }),
    prisma.statementIgnore.findMany({ where: { userId }, select: { fingerprint: true } }),
  ]);

  const app: AppMovement[] = [
    ...transactions.map((t) => ({
      day: utcDay(t.date),
      amount: Number(t.amount),
      kind: "transaction" as const,
    })),
    ...receipts.map((r) => ({
      day: utcDay(r.occurrenceDate),
      amount: -Number(r.amount),
      kind: "income" as const,
    })),
    ...payments.map((p) => ({
      day: localDay(p.paidAt),
      amount: Number(p.amount),
      kind: p.cardId ? ("billPayment" as const) : ("fixedPayment" as const),
    })),
    ...jars.map((d) => ({
      day: localDay(d.createdAt),
      amount: Number(d.amount),
      kind: "jar" as const,
    })),
  ];

  const ignored = new Set(ignores.map((i) => i.fingerprint));
  const result = reconcile(parsed.lines, parsed.holder, app);
  const open = result.filter((r) => r.kind === "movement" && !r.matched);
  const differences: StatementDifference[] = [];
  for (const r of open) {
    if (ignored.has(r.fingerprint)) continue;
    differences.push({
      fingerprint: r.fingerprint,
      date: r.line.date.toISOString().slice(0, 10),
      direction: r.line.direction,
      amount: r.line.amount,
      description: r.description,
      categoryId: await categoryFromHistory(userId, r.description),
    });
  }

  return {
    ok: true,
    period: parsed.period && {
      start: parsed.period.start.toISOString().slice(0, 10),
      end: parsed.period.end.toISOString().slice(0, 10),
    },
    total: result.length,
    matched: result.filter((r) => r.matched).length,
    ownTransfers: result.filter((r) => r.kind === "ownTransfer").length,
    investments: result.filter((r) => r.kind === "investment").length,
    alreadyIgnored: open.length - differences.length,
    unmatchedBills: result
      .filter((r) => r.kind === "billPayment" && !r.matched)
      .map((r) => ({ date: r.line.date.toISOString().slice(0, 10), amount: r.line.amount })),
    differences,
  };
}

const decisionSchema = z.object({
  add: z
    .array(
      z.object({
        fingerprint: z.string().min(1).max(300),
        date: z.iso.date(),
        direction: z.enum(["in", "out"]),
        amount: z.number().positive(),
        description: z.string().trim().min(1).max(120),
        categoryId: z.string().nullable(),
      }),
    )
    .max(500),
  ignore: z.array(z.string().min(1).max(300)).max(500),
});

/**
 * Grava o que a pessoa decidiu: o que adicionar vira lançamento comum
 * (gasto ou receita, no dia do extrato); o que ignorar fica lembrado.
 */
export async function applyStatementDecisions(input: unknown) {
  const userId = await requireUserId();
  const { add, ignore } = decisionSchema.parse(input);

  // Categoria só se for do próprio usuário.
  const categoryIds = new Set(
    (
      await prisma.category.findMany({
        where: { userId, id: { in: add.flatMap((a) => (a.categoryId ? [a.categoryId] : [])) } },
        select: { id: true },
      })
    ).map((c) => c.id),
  );

  await prisma.$transaction([
    prisma.transaction.createMany({
      data: add.map((a) => ({
        userId,
        description: a.description,
        // Receita é negativa no banco.
        amount: a.direction === "out" ? a.amount : -a.amount,
        date: new Date(`${a.date}T00:00:00.000Z`),
        categoryId: a.categoryId && categoryIds.has(a.categoryId) ? a.categoryId : null,
      })),
    }),
    prisma.statementIgnore.createMany({
      data: ignore.map((fingerprint) => ({ userId, fingerprint })),
      skipDuplicates: true,
    }),
  ]);
  revalidatePath("/");
  revalidatePath("/historico");
  return { added: add.length, ignored: ignore.length };
}
