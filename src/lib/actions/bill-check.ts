"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { withUserAiQuota } from "@/lib/ai-quota-store";
import { Refusal, refusing } from "@/lib/action-result";
import { toFixedExpenseInput } from "@/lib/budget-inputs";
import {
  buildCardBillSeries,
  cardBillFixedExpenses,
  findNextOpenBill,
  installmentSlices,
  storedDay,
} from "@/lib/period";
import { askBillCheck, type BillAiFinding } from "@/lib/bill-ai-check";

export interface BillCheckResult {
  summary: string;
  dueDate: string;
  total: number;
  findings: (BillAiFinding & {
    /** O que o botão de correção faz, já conferido contra os dados. */
    fix:
      | { type: "deleteEstimate"; id: string; label: string }
      | { type: "deletePurchase"; id: string; label: string }
      | null;
  })[];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const localIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const printsSchema = z
  .object({ from: z.iso.date(), to: z.iso.date(), total: z.number().nonnegative() })
  .nullable();

/**
 * Manda a próxima fatura em aberto do cartão, item por item, para a IA, que
 * aponta previsão no mês errado, compra repetida e diferença com as prints do
 * banco. Não grava nada: cada correção é um toque, com as actions de sempre.
 */
export async function checkBillWithAi(cardId: string, prints: unknown) {
  return refusing(async (): Promise<BillCheckResult> => {
    const userId = await requireUserId();
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Refusal("A conferência com IA não está configurada (falta ANTHROPIC_API_KEY).");
    }
    const card = await prisma.creditCard.findUnique({
      where: { id: cardId, userId, deletedAt: null },
      include: {
        purchases: { where: { userId } },
        fixedExpenses: { include: { pauses: true } },
        billEstimates: true,
        payments: true,
      },
    });
    if (!card) throw new Refusal("Cartão não encontrado.");

    const today = new Date();
    const cardInput = { id: card.id, closingDay: card.closingDay, dueDay: card.dueDay };
    const purchases = card.purchases.map((p) => ({
      cardId: card.id,
      amount: Number(p.amount),
      date: p.date,
      installments: p.installments,
    }));
    const cardFixedExpenses = card.fixedExpenses.map(toFixedExpenseInput);
    const bills = buildCardBillSeries({
      card: cardInput,
      purchases,
      cardFixedExpenses,
      billEstimates: card.billEstimates.map((e) => ({
        cardId: e.cardId,
        dueDate: e.dueDate,
        amount: Number(e.amount),
      })),
      expensePayments: card.payments.map((p) => ({
        cardId: p.cardId ?? undefined,
        dueDate: p.dueDate,
        amount: Number(p.amount),
        settled: p.settled,
      })),
      today,
      months: 6,
    });
    const bill = findNextOpenBill(bills);
    if (!bill) throw new Refusal("Não há fatura em aberto para conferir.");

    const inBill = card.purchases.flatMap((p, i) => {
      const slices = installmentSlices(purchases[i], card.closingDay);
      const k = slices.findIndex((s) => s.cycleEnd.getTime() === bill.cycleEnd.getTime());
      if (k < 0) return [];
      return [
        {
          id: p.id,
          description: p.description,
          date: iso(p.date),
          createdAt: p.createdAt?.toISOString() ?? null,
          amount: slices[k].amount,
          installment: slices.length > 1 ? `${k + 1}/${slices.length}` : null,
        },
      ];
    });
    const subscriptions = cardBillFixedExpenses({
      card: cardInput,
      cardFixedExpenses,
      dueDate: bill.dueDate,
    }).map((e) => ({
      label: card.fixedExpenses.find((f) => f.id === e.id)?.label ?? "Assinatura",
      amount: e.amount,
    }));
    const openDue = new Set(bills.filter((b) => !b.paid).map((b) => b.dueDate.getTime()));
    const estimates = card.billEstimates
      .filter((e) => openDue.has(storedDay(e.dueDate).getTime()))
      .map((e) => ({
        id: e.id,
        description: e.description,
        amount: Number(e.amount),
        dueDate: localIso(storedDay(e.dueDate)),
        createdAt: e.createdAt.toISOString(),
      }));

    // Antes da cota: um pedido malformado não pode gastar uma chamada.
    const parsedPrints = printsSchema.parse(prints ?? null);
    const ai = await withUserAiQuota(userId, "bill", () =>
      askBillCheck({
        card: { name: card.name, closingDay: card.closingDay, dueDay: card.dueDay },
        today: localIso(today),
        bill: {
          dueDate: localIso(bill.dueDate),
          cycleStart: localIso(bill.cycleStart),
          cycleEnd: localIso(bill.cycleEnd),
          total: Math.round(bill.amount * 100) / 100,
          purchases: Math.round(bill.purchaseAmount * 100) / 100,
          subscriptions: Math.round(bill.fixedExpenseAmount * 100) / 100,
          estimates: Math.round(bill.estimateAmount * 100) / 100,
        },
        purchases: inBill,
        subscriptions,
        estimates,
        prints: parsedPrints,
      }),
    );

    // Só correções que apontam para algo que existe: o resto vira comentário.
    const estimateById = new Map(estimates.map((e) => [e.id, e]));
    const purchaseById = new Map(inBill.map((p) => [p.id, p]));
    return {
      summary: ai.summary,
      dueDate: localIso(bill.dueDate),
      total: Math.round(bill.amount * 100) / 100,
      findings: ai.findings.map((f) => {
        const estimate = f.estimateId ? estimateById.get(f.estimateId) : undefined;
        const purchase = f.purchaseId ? purchaseById.get(f.purchaseId) : undefined;
        const fix =
          f.kind === "estimate" && estimate
            ? { type: "deleteEstimate" as const, id: estimate.id, label: "Apagar a previsão" }
            : f.kind === "duplicate" && purchase
              ? { type: "deletePurchase" as const, id: purchase.id, label: "Apagar a compra repetida" }
              : null;
        return { ...f, fix };
      }),
    };
  });
}
