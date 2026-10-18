import { prisma } from "@/lib/prisma";
import { storedDay } from "@/lib/period";
import { summarizeDebts } from "@/lib/loans";
import { formatCurrency, formatDate } from "@/lib/format";

/** Uma pessoa que te deve, pronta para a tela (textos já formatados). */
export interface DebtView {
  personId: string;
  name: string;
  remaining: number;
  /** "parcela 2/3 · R$ 100,00 · vence 10 de nov." ou "desde 03 de out." */
  detail: string;
  overdue: boolean;
  /** O valor sugerido no "Recebi": a parcela em aberto, ou o total. */
  suggested: number;
  loans: { id: string; label: string; detail: string; settled: boolean }[];
}

/**
 * Quem te deve, para a Início. As datas das despesas e o vencimento combinado
 * são dias de calendário gravados em meia-noite UTC — lidos com storedDay,
 * como no resto do app.
 */
export async function loadDebts(userId: string, today: Date): Promise<DebtView[]> {
  const people = await prisma.person.findMany({
    where: { userId },
    include: {
      loans: {
        include: {
          transaction: { select: { description: true, date: true } },
          cardPurchase: { select: { description: true, date: true, installments: true } },
        },
      },
      repayments: { include: { transaction: { select: { amount: true } } } },
    },
  });
  if (people.length === 0) return [];

  const loanInfo = new Map<string, { description: string; date: Date }>();
  const loans = people.flatMap((person) =>
    person.loans.map((loan) => {
      const source = loan.transaction ?? loan.cardPurchase;
      const date = source ? storedDay(source.date) : loan.createdAt;
      loanInfo.set(loan.id, { description: source?.description ?? "Empréstimo", date });
      return {
        id: loan.id,
        personId: person.id,
        amount: Number(loan.amount),
        date,
        installments: loan.installments,
        ...(loan.firstDueDate ? { firstDueDate: storedDay(loan.firstDueDate) } : {}),
      };
    }),
  );
  const repayments = people.flatMap((person) =>
    person.repayments.map((r) => ({ personId: person.id, amount: -Number(r.transaction.amount) })),
  );

  const nameById = new Map(people.map((p) => [p.id, p.name]));
  return summarizeDebts({ loans, repayments, today }).map((debt) => {
    const next = debt.next;
    const detail = next
      ? [
          next.installments > 1 ? `parcela ${next.number}/${next.installments}` : null,
          formatCurrency(next.amount),
          `${next.overdue ? "venceu" : "vence"} ${formatDate(next.dueDate)}`,
        ]
          .filter(Boolean)
          .join(" · ")
      : `desde ${formatDate(debt.since ?? today)}`;
    return {
      personId: debt.personId,
      name: nameById.get(debt.personId) ?? "Alguém",
      remaining: debt.remaining,
      detail,
      overdue: next?.overdue ?? false,
      suggested: next?.amount ?? debt.remaining,
      loans: debt.loans.map((status) => {
        const info = loanInfo.get(status.id)!;
        return {
          id: status.id,
          label: info.description,
          detail: [
            formatDate(info.date),
            formatCurrency(status.amount),
            status.remaining <= 0.005
              ? "pago"
              : status.paid > 0
                ? `falta ${formatCurrency(status.remaining)}`
                : null,
          ]
            .filter(Boolean)
            .join(" · "),
          settled: status.remaining <= 0.005,
        };
      }),
    };
  });
}
