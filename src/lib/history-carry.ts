import { prisma } from "@/lib/prisma";
import { loadHistoryItems } from "@/lib/history-items";
import { calculateReportTotals } from "@/lib/report-totals";

/**
 * O que sobrou ou faltou de tudo antes do período: a soma dos saldos de todos
 * os meses anteriores, desde o primeiro registro. É o que o Histórico leva
 * para o saldo do período — o que faltou em setembro não some em outubro,
 * como no resto do app (PRODUCT.md, "Cada mês leva em conta o anterior").
 *
 * Usa o mesmo `loadHistoryItems` e o mesmo critério de saldo do resumo, num
 * intervalo só, do primeiro registro até o começo do período.
 */
export async function carriedBalance(
  userId: string,
  range: { rangeStart: Date; utcRangeStart: Date },
): Promise<number> {
  const [t, r, p, j, c, f] = await Promise.all([
    prisma.transaction.aggregate({
      where: { userId, fromPeriodClose: false },
      _min: { date: true },
    }),
    prisma.incomeReceipt.aggregate({ where: { userId }, _min: { occurrenceDate: true } }),
    prisma.expensePayment.aggregate({ where: { userId }, _min: { paidAt: true } }),
    prisma.jarDeposit.aggregate({ where: { userId }, _min: { createdAt: true } }),
    prisma.cardPurchase.aggregate({ where: { userId }, _min: { date: true } }),
    // A assinatura no cartão não tem registro por cobrança: entra pela fatura,
    // desde o cadastro dela.
    prisma.fixedExpense.aggregate({
      where: { userId, cardId: { not: null } },
      _min: { createdAt: true },
    }),
  ]);
  const firsts = [
    t._min.date,
    r._min.occurrenceDate,
    p._min.paidAt,
    j._min.createdAt,
    c._min.date,
    f._min.createdAt,
  ].filter((d): d is Date => d != null);
  if (firsts.length === 0) return 0;
  const first = new Date(Math.min(...firsts.map((d) => d.getTime())));
  // Um dia antes do primeiro registro: as datas de calendário (meia-noite UTC)
  // e os instantes locais caem os dois dentro.
  const start = new Date(first.getFullYear(), first.getMonth(), first.getDate() - 1);
  if (start.getTime() >= range.rangeStart.getTime()) return 0;

  const { items } = await loadHistoryItems(userId, {
    rangeStart: start,
    rangeEnd: range.rangeStart,
    utcRangeStart: new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())),
    utcRangeEnd: range.utcRangeStart,
  });
  return calculateReportTotals({
    items,
    rangeStart: start,
    rangeEnd: range.rangeStart,
    today: new Date(),
  }).balance;
}
