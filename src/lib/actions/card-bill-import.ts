import { prisma } from "@/lib/prisma";
import { categoryFromHistory } from "@/lib/category-from-history";
import { toFixedExpenseInput } from "@/lib/budget-inputs";
import { buildCardBills, cardBillFixedExpenses, installmentSlices } from "@/lib/period";
import { parseSicoobCardBill } from "@/lib/statement/sicoob-card";
import type { PdfTextItem } from "@/lib/statement/nubank";
import {
  purchaseFromLine,
  reconcileCardBill,
  type AppCharge,
} from "@/lib/statement/card-reconcile";
import { normalizeName } from "@/lib/shortcut";

export interface CardBillDifference {
  fingerprint: string;
  /** O dia da compra na fatura, "YYYY-MM-DD". */
  date: string;
  /** O valor cobrado nesta fatura (a parcela, se parcelada). */
  amount: number;
  description: string;
  installment: { current: number; total: number } | null;
  fee: boolean;
  /** A compra que "Adicionar" cria: só as parcelas que faltam. */
  purchase: { date: string; amount: number; installments: number; description: string };
  categoryId: string | null;
}

export type CardBillAnalysis =
  | { ok: false; error: string }
  | {
      ok: true;
      mode: "card";
      cards: { id: string; name: string }[];
      cardId: string;
      dueDate: string | null;
      bankTotal: number | null;
      appTotal: number;
      lineCount: number;
      matched: number;
      alreadyIgnored: number;
      differences: CardBillDifference[];
    };

const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Um dia local (como o app guarda o ciclo) como meia-noite UTC (como as compras). */
const asStoredDay = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));

/**
 * Confere uma fatura do cartão com o cartão escolhido no app (ou o que tem o
 * nome do banco). Não grava nada. Chamada por `analyzeStatement`.
 */
export async function analyzeCardBill(
  userId: string,
  pages: PdfTextItem[][],
  requestedCardId: string | null,
): Promise<CardBillAnalysis> {
  const bill = parseSicoobCardBill(pages);
  if (bill.lines.length === 0) {
    return { ok: false, error: "Não reconheci lançamentos nessa fatura." };
  }
  const cards = await prisma.creditCard.findMany({
    where: { userId, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  if (cards.length === 0) {
    return { ok: false, error: "Cadastre o cartão em Cartões antes de importar a fatura dele." };
  }
  const cardId =
    cards.find((c) => c.id === requestedCardId)?.id ??
    cards.find((c) => normalizeName(c.name).includes("sicoob"))?.id ??
    cards[0].id;

  const card = await prisma.creditCard.findUniqueOrThrow({
    where: { id: cardId },
    include: {
      purchases: true,
      fixedExpenses: { include: { pauses: true } },
      billEstimates: true,
      payments: true,
    },
  });
  const purchases = card.purchases.map((p) => ({
    cardId: card.id,
    amount: Number(p.amount),
    date: p.date,
    installments: p.installments,
  }));
  const cardFixedExpenses = card.fixedExpenses.map(toFixedExpenseInput);
  const cardInput = { id: card.id, closingDay: card.closingDay, dueDay: card.dueDay };

  // A fatura do app que corresponde a esta: o primeiro vencimento do cartão
  // a partir de alguns dias antes do vencimento do banco.
  const due = bill.dueDate ?? bill.closingDate ?? new Date();
  const from = new Date(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate() - 12);
  const [appBill] = buildCardBills({
    card: cardInput,
    purchases,
    cardFixedExpenses,
    billEstimates: card.billEstimates.map((e) => ({
      cardId: e.cardId,
      dueDate: e.dueDate,
      amount: Number(e.amount),
    })),
    expensePayments: [],
    from,
    months: 1,
  });

  const charges: AppCharge[] = [
    ...card.purchases.flatMap((p, i) =>
      installmentSlices(purchases[i], card.closingDay)
        .filter((s) => s.cycleEnd.getTime() === appBill.cycleEnd.getTime())
        .map((s) => ({
          amount: s.amount,
          day: Math.floor(p.date.getTime() / 86_400_000),
          installments: p.installments,
        })),
    ),
    ...cardBillFixedExpenses({ card: cardInput, cardFixedExpenses, dueDate: appBill.dueDate }).map(
      (e) => ({ amount: e.amount, day: null, installments: 1 }),
    ),
  ];

  const ignored = new Set(
    (
      await prisma.statementIgnore.findMany({ where: { userId }, select: { fingerprint: true } })
    ).map((i) => i.fingerprint),
  );
  const matches = reconcileCardBill(bill.lines, charges, card.id);
  const open = matches.filter((m) => !m.matched);
  const cycleEnd = asStoredDay(appBill.cycleEnd);
  const differences: CardBillDifference[] = [];
  for (const m of open) {
    if (ignored.has(m.fingerprint)) continue;
    const purchase = purchaseFromLine(m.line, cycleEnd);
    differences.push({
      fingerprint: m.fingerprint,
      date: iso(m.line.date),
      amount: m.line.amount,
      description: purchase.description,
      installment: m.line.installment,
      fee: m.line.fee,
      purchase: { ...purchase, date: iso(purchase.date) },
      categoryId: await categoryFromHistory(userId, purchase.description),
    });
  }

  return {
    ok: true,
    mode: "card",
    cards,
    cardId: card.id,
    dueDate: bill.dueDate ? iso(bill.dueDate) : null,
    bankTotal: bill.total,
    appTotal: Math.round(appBill.amount * 100) / 100,
    lineCount: bill.lines.length,
    matched: matches.length - open.length,
    alreadyIgnored: open.length - differences.length,
    differences,
  };
}
