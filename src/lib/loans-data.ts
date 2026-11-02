import { prisma } from "@/lib/prisma";
import { storedDay } from "@/lib/period";
import { loanReport, summarizeDebts } from "@/lib/loans";
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
  loans: {
    id: string;
    label: string;
    detail: string;
    settled: boolean;
    /** O que falta deste empréstimo: o que dá para dar como perdido. */
    remaining: number;
  }[];
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
        forgiven: Number(loan.forgiven),
      };
    }),
  );
  const repayments = people.flatMap((person) =>
    person.repayments.map((r) => ({ personId: person.id, amount: -Number(r.transaction.amount) })),
  );

  const nameById = new Map(people.map((p) => [p.id, p.name]));
  return summarizeDebts({ loans, repayments, today }).map((debt) => {
    const next = debt.next;
    // Ao lado do "te deve R$ X": o valor da próxima parcela vem rotulado, e
    // some quando é o mesmo total — senão a linha mostra dois valores iguais
    // sem dizer o que o segundo é.
    const nextAmount =
      next && Math.abs(next.amount - debt.remaining) >= 0.005
        ? `${next.installments > 1 ? "" : "próximo "}${formatCurrency(next.amount)}`
        : null;
    const detail = next
      ? [
          next.installments > 1 ? `parcela ${next.number}/${next.installments}` : null,
          nextAmount,
          `${next.overdue ? "venceu em" : "vence em"} ${formatDate(next.dueDate)}`,
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
            // O valor do empréstimo, e não o que sobrou depois do perdido.
            formatCurrency(status.amount + (status.forgiven ?? 0)),
            status.forgiven ? `${formatCurrency(status.forgiven)} não vai ser pago` : null,
            status.remaining <= 0.005
              ? status.forgiven
                ? null
                : "pago"
              : status.paid > 0
                ? `falta ${formatCurrency(status.remaining)}`
                : null,
          ]
            .filter(Boolean)
            .join(" · "),
          settled: status.remaining <= 0.005,
          remaining: status.remaining,
        };
      }),
    };
  });
}


export interface LoanReportView {
  total: { lent: number; repaid: number; forgiven: number; open: number };
  people: {
    personId: string;
    name: string;
    lent: number;
    repaid: number;
    forgiven: number;
    open: number;
    loans: {
      id: string;
      label: string;
      date: string;
      amount: number;
      repaid: number;
      forgiven: number;
      open: number;
    }[];
    repayments: { date: string; amount: number }[];
  }[];
}

/** O relatório de empréstimos: todo o histórico, de cada pessoa, com os textos prontos. */
export async function loadLoanReport(userId: string): Promise<LoanReportView> {
  const people = await prisma.person.findMany({
    where: { userId },
    include: {
      loans: {
        include: {
          transaction: { select: { description: true, date: true } },
          cardPurchase: { select: { description: true, date: true } },
        },
      },
      repayments: { include: { transaction: { select: { amount: true, date: true } } } },
    },
  });
  const info = new Map<string, { label: string; date: Date }>();
  const report = loanReport({
    loans: people.flatMap((person) =>
      person.loans.map((loan) => {
        const source = loan.transaction ?? loan.cardPurchase;
        const date = source ? storedDay(source.date) : loan.createdAt;
        info.set(loan.id, { label: source?.description ?? "Empréstimo", date });
        return {
          id: loan.id,
          personId: person.id,
          amount: Number(loan.amount),
          date,
          installments: loan.installments,
          forgiven: Number(loan.forgiven),
        };
      }),
    ),
    repayments: people.flatMap((person) =>
      person.repayments.map((r) => ({
        personId: person.id,
        // Receita é negativa no banco.
        amount: -Number(r.transaction.amount),
        date: storedDay(r.transaction.date),
      })),
    ),
  });
  const nameById = new Map(people.map((p) => [p.id, p.name]));
  return {
    total: report.total,
    people: report.people.map((p) => ({
      ...p,
      name: nameById.get(p.personId) ?? "Alguém",
      loans: p.loans.map((l) => ({
        ...l,
        label: info.get(l.id)!.label,
        date: formatDate(info.get(l.id)!.date),
      })),
      repayments: p.repayments.map((r) => ({ amount: r.amount, date: formatDate(r.date) })),
    })),
  };
}
