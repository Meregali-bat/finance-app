import { prisma } from "@/lib/prisma";
import { billLinesInRange } from "@/lib/history-bills";
import { toFixedExpenseInput } from "@/lib/budget-inputs";
import { lentNames, type HistoryItem } from "@/lib/history-item";

/**
 * Tudo o que mexeu no dinheiro num intervalo, linha a linha: lançamentos,
 * parcelas e assinaturas de cada fatura que vence nele, contas fixas pagas,
 * rendas confirmadas e caixinhas. É o que o Histórico mostra e o que as fatias
 * da renda somam — as duas telas contam o mesmo dinheiro do mesmo jeito.
 */
export async function loadHistoryItems(
  userId: string,
  range: { rangeStart: Date; rangeEnd: Date; utcRangeStart: Date; utcRangeEnd: Date },
) {
  // Duas bordas para duas convenções de gravação: lançamentos guardam um dia
  // do calendário em meia-noite UTC, confirmações guardam instantes locais.
  const { rangeStart, rangeEnd, utcRangeStart, utcRangeEnd } = range;

  const [transactions, expensePayments, incomeReceipts, categories, creditCards, jarDeposits] =
    await Promise.all([
      // Sem as linhas do fechamento de período antigo: eram a sobra do mês
      // anterior devolvida ao orçamento, e o total de recebido as lia como renda
      // nova — o mesmo salário contado duas vezes.
      prisma.transaction.findMany({
        where: { userId, fromPeriodClose: false, date: { gte: utcRangeStart, lt: utcRangeEnd } },
        include: {
          category: { select: { id: true, name: true } },
          loans: { select: { person: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
        },
      }),
      // Agrupado pela data em que foi pago, não pelo vencimento: pagar antes do
      // vencimento faz o registro cair no mês em que o dinheiro de fato saiu.
      // Sem os pagos no cartão: valem 0, e quem mostra o gasto é a compra.
      prisma.expensePayment.findMany({
        where: { userId, cardPurchaseId: null, paidAt: { gte: rangeStart, lt: rangeEnd } },
        include: {
          fixedExpense: {
            select: { label: true, category: { select: { id: true, name: true } } },
          },
          card: { select: { name: true } },
        },
      }),
      // Agrupado pelo dia do pagamento — é quando o dinheiro entrou. Não existe
      // "recebido em" separado: confirmar é dizer que aquele pagamento chegou.
      prisma.incomeReceipt.findMany({
        where: { userId, occurrenceDate: { gte: rangeStart, lt: rangeEnd } },
        include: { income: { select: { label: true } } },
      }),
      prisma.category.findMany({ where: { userId, active: true }, orderBy: { name: "asc" } }),
      // Todos os cartões, inclusive os desativados e apagados, com tudo o que
      // forma uma fatura: o histórico de um cartão não pode sumir com ele.
      prisma.creditCard.findMany({
        where: { userId },
        orderBy: { name: "asc" },
        include: {
          purchases: {
            include: {
              category: { select: { id: true, name: true } },
              loans: {
                select: { person: { select: { name: true } } },
                orderBy: { createdAt: "asc" },
              },
            },
          },
          fixedExpenses: {
            include: { pauses: true, category: { select: { id: true, name: true } } },
          },
          billEstimates: true,
          payments: true,
        },
      }),
      prisma.jarDeposit.findMany({
        where: { userId, createdAt: { gte: rangeStart, lt: rangeEnd } },
        include: { jar: { select: { name: true } } },
      }),
    ]);

  // O nome vem junto de cada lançamento, e não só da lista de categorias
  // ativas: um lançamento pode apontar para uma categoria já desativada.
  const categoryNameById = new Map<string, string>(categories.map((c) => [c.id, c.name]));
  const rememberCategory = (category: { id: string; name: string } | null | undefined) => {
    if (category) categoryNameById.set(category.id, category.name);
    return category?.id ?? null;
  };

  /**
   * O cartão entra pelas faturas que vencem no intervalo, aberta cada uma nas
   * linhas que a compõem — o mesmo mês em que o orçamento e a previsão contam
   * cada parcela. Antes a compra entrava inteira no dia em que foi feita, e o
   * Histórico de um mês nunca batia com o que o orçamento dele descontava.
   */
  const cardItems: HistoryItem[] = creditCards.flatMap((card) => {
    const purchaseById = new Map(card.purchases.map((p) => [p.id, p]));
    const expenseById = new Map(card.fixedExpenses.map((e) => [e.id, e]));
    const estimateById = new Map(card.billEstimates.map((e) => [e.id, e]));

    const lines = billLinesInRange({
      card: { id: card.id, closingDay: card.closingDay, dueDay: card.dueDay },
      purchases: card.purchases.map((p) => ({
        id: p.id,
        cardId: card.id,
        amount: Number(p.amount),
        date: p.date,
        installments: p.installments,
      })),
      cardFixedExpenses: card.fixedExpenses.map(toFixedExpenseInput),
      billEstimates: card.billEstimates.map((e) => ({
        id: e.id,
        cardId: card.id,
        dueDate: e.dueDate,
        amount: Number(e.amount),
      })),
      expensePayments: card.payments.map((p) => ({
        cardId: p.cardId ?? undefined,
        dueDate: p.dueDate,
        amount: Number(p.amount),
        // Um parcial não quita a fatura.
        settled: p.settled,
      })),
      start: rangeStart,
      end: rangeEnd,
    });

    const onCard = { cardId: card.id, cardName: card.name };
    return lines.map((line): HistoryItem => {
      switch (line.kind) {
        case "installment": {
          const purchase = purchaseById.get(line.purchaseId)!;
          return {
            ...onCard,
            id: purchase.id,
            kind: "card",
            description: purchase.description,
            amount: line.amount,
            date: line.dueDate,
            createdAt: purchase.createdAt,
            categoryId: rememberCategory(purchase.category),
            slice: purchase.slice,
            installments: purchase.installments,
            installmentNumber: line.installmentNumber,
            purchaseAmount: Number(purchase.amount),
            purchaseDate: purchase.date,
            lentTo: lentNames(purchase.loans),
          };
        }
        case "subscription": {
          const expense = expenseById.get(line.fixedExpenseId)!;
          return {
            ...onCard,
            // Derivada da fatura: o id diz de qual fatura, senão se repetiria
            // em todo mês.
            id: `${card.id}-${line.dueDate.toISOString()}-${expense.id}`,
            kind: "cardFixedExpense",
            description: expense.label,
            amount: line.amount,
            date: line.dueDate,
            categoryId: rememberCategory(expense.category),
          };
        }
        case "estimate": {
          const estimate = estimateById.get(line.estimateId)!;
          return {
            ...onCard,
            id: estimate.id,
            kind: "cardEstimate",
            description: estimate.description,
            amount: line.amount,
            date: line.dueDate,
            categoryId: null,
          };
        }
        case "adjustment":
          return {
            ...onCard,
            id: `${card.id}-${line.dueDate.toISOString()}-adjustment`,
            kind: "cardBillAdjustment",
            description: `Diferença na fatura do ${card.name}`,
            amount: line.amount,
            date: line.dueDate,
            categoryId: null,
          };
      }
    });
  });

  const items: HistoryItem[] = [
    ...transactions.map((t) => ({
      id: t.id,
      kind: "transaction" as const,
      description: t.description,
      amount: Number(t.amount),
      date: t.date,
      createdAt: t.createdAt,
      categoryId: rememberCategory(t.category),
      slice: t.slice,
      lentTo: lentNames(t.loans),
    })),
    ...cardItems,
    ...expensePayments.map((p) => ({
      id: p.id,
      kind: p.cardId ? ("cardBillPayment" as const) : ("fixedExpensePayment" as const),
      description: p.cardId
        ? `Fatura do ${p.card?.name ?? "cartão"}`
        : (p.fixedExpense?.label ?? "Despesa fixa"),
      amount: Number(p.amount),
      date: p.paidAt,
      categoryId: rememberCategory(p.fixedExpense?.category),
      cardId: p.cardId ?? undefined,
      cardName: p.card?.name,
      settled: p.settled,
    })),
    // Negativo porque é receita, que é como o HistoryItem marca dinheiro que
    // entra — é assim que o total de recebido enxerga a receita fixa.
    ...incomeReceipts.map((r) => ({
      id: r.id,
      kind: "incomeReceipt" as const,
      description: r.income.label,
      amount: -Number(r.amount),
      date: r.occurrenceDate,
      categoryId: null,
      incomeId: r.incomeId,
    })),
    // O dinheiro que foi para as caixinhas ou voltou delas. O orçamento já o
    // tirava do disponível; sem ele aqui, o saldo do mês no Histórico nunca
    // batia com o da Início.
    ...jarDeposits.map((d) => ({
      id: d.id,
      kind: "jarDeposit" as const,
      description:
        Number(d.amount) < 0 ? `Resgate de "${d.jar.name}"` : `Guardado em "${d.jar.name}"`,
      amount: Number(d.amount),
      date: d.createdAt,
      categoryId: null,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return { items, categories, creditCards, categoryNameById };
}
