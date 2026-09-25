import { prisma } from "@/lib/prisma";
import { storedDay } from "@/lib/period";
import type {
  CardBillEstimateInput,
  CardPurchaseInput,
  CreditCardInput,
  ExpensePaymentInput,
  FixedExpenseInput,
  IncomeInput,
  IncomeReceiptInput,
  JarDepositInput,
  TransactionInput,
} from "@/lib/period";
import {
  calculateAccountBalance,
  calculateRegisteredMovement,
  type AccountBalanceAdjustmentInput,
  type AccountMovementInput,
} from "@/lib/account-balance";

/**
 * As entradas puras de `period.ts` acrescidas do rótulo que a tela mostra.
 * Cada uma é um superset do tipo original, então continuam servindo a
 * `calculateDailyBudget` sem conversão nenhuma.
 */
export type NamedIncomeInput = IncomeInput & { label: string };
export type NamedFixedExpenseInput = FixedExpenseInput & { label: string };
export type NamedCreditCardInput = CreditCardInput & {
  name: string;
  creditLimit?: number;
  active: boolean;
};
export type NamedTransactionInput = TransactionInput & {
  id: string;
  description: string;
  categoryId: string | null;
};

export interface BudgetInputs {
  incomes: NamedIncomeInput[];
  incomeReceipts: IncomeReceiptInput[];
  fixedExpenses: NamedFixedExpenseInput[];
  creditCards: NamedCreditCardInput[];
  cardPurchases: CardPurchaseInput[];
  billEstimates: CardBillEstimateInput[];
  expensePayments: ExpensePaymentInput[];
  transactions: NamedTransactionInput[];
  jarDeposits: JarDepositInput[];
  /** A matéria-prima do saldo em conta — ver `accountBalanceOf`. */
  account: {
    adjustment?: AccountBalanceAdjustmentInput;
    credits: AccountMovementInput[];
    debits: AccountMovementInput[];
  };
}

/**
 * Tudo que as contas de período precisam, numa consulta só e já convertido de
 * `Decimal` para `number` — nada de Prisma atravessa para os módulos puros.
 *
 * Carrega também o que foi desligado, de propósito. Quem decide o que cada
 * coisa inativa ainda faz são os módulos puros, pela mesma regra em todas as
 * telas: uma renda desligada não marca mais período nem é projetada, mas o que
 * ela pagou continua contando; uma despesa encerrada para no `endedAt`; um
 * cartão desativado continua devendo as parcelas que já tinha. Filtrar aqui
 * fazia a Início e o fechamento enxergarem meses diferentes.
 */
export async function loadBudgetInputs(userId: string): Promise<BudgetInputs> {
  const [
    incomes,
    incomeReceipts,
    fixedExpenses,
    creditCards,
    transactions,
    expensePayments,
    billEstimates,
    jarDeposits,
    adjustment,
  ] = await Promise.all([
    prisma.income.findMany({ where: { userId } }),
    prisma.incomeReceipt.findMany({ where: { userId } }),
    prisma.fixedExpense.findMany({ where: { userId } }),
    prisma.creditCard.findMany({ where: { userId }, include: { purchases: true } }),
    prisma.transaction.findMany({ where: { userId }, orderBy: { date: "desc" } }),
    prisma.expensePayment.findMany({ where: { userId } }),
    prisma.cardBillEstimate.findMany({ where: { userId } }),
    prisma.jarDeposit.findMany({ where: { userId } }),
    prisma.balanceAdjustment.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
  ]);

  return {
    incomes: incomes.map((i) => ({
      id: i.id,
      label: i.label,
      amount: Number(i.amount),
      dayOfMonth: i.dayOfMonth,
      createdAt: i.createdAt,
      active: i.active,
    })),
    incomeReceipts: incomeReceipts.map((r) => ({
      incomeId: r.incomeId,
      occurrenceDate: r.occurrenceDate,
      amount: Number(r.amount),
    })),
    fixedExpenses: fixedExpenses.map((e) => ({
      id: e.id,
      label: e.label,
      amount: Number(e.amount),
      dueDay: e.dueDay ?? undefined,
      createdAt: e.createdAt,
      // É esta data, e não `active`, que corta a despesa: toda despesa
      // desligada tem uma (a migration que criou a coluna carimbou as antigas).
      endedAt: e.endedAt ?? undefined,
      cardId: e.cardId ?? undefined,
    })),
    creditCards: creditCards.map((c) => ({
      id: c.id,
      name: c.name,
      closingDay: c.closingDay,
      dueDay: c.dueDay,
      active: c.active,
      // `== null`, e não um ternário sobre o valor: Number(null) é 0, e um zero
      // aqui passaria a valer como "limite zero" em vez de "limite não
      // informado" — que é o que getCardLimitUsage usa para devolver null.
      creditLimit: c.creditLimit == null ? undefined : Number(c.creditLimit),
    })),
    cardPurchases: creditCards.flatMap((c) =>
      c.purchases.map((p) => ({
        cardId: c.id,
        amount: Number(p.amount),
        date: p.date,
        installments: p.installments,
      })),
    ),
    billEstimates: billEstimates.map((e) => ({
      cardId: e.cardId,
      dueDate: e.dueDate,
      amount: Number(e.amount),
    })),
    expensePayments: expensePayments.map((p) => ({
      // null vira undefined: period.ts compara os dois lados por igualdade
      // estrita, e null !== undefined faria o pagamento nunca casar.
      fixedExpenseId: p.fixedExpenseId ?? undefined,
      cardId: p.cardId ?? undefined,
      dueDate: p.dueDate,
      amount: Number(p.amount),
    })),
    transactions: transactions.map((t) => ({
      id: t.id,
      description: t.description,
      amount: Number(t.amount),
      date: t.date,
      categoryId: t.categoryId,
      fromPeriodClose: t.fromPeriodClose,
    })),
    jarDeposits: jarDeposits.map((d) => ({ amount: Number(d.amount), date: d.createdAt })),
    account: {
      adjustment: adjustment
        ? { balance: Number(adjustment.balance), createdAt: adjustment.createdAt }
        : undefined,
      // As quatro tabelas viram duas listas genéricas aqui, e não dentro de
      // account-balance.ts: a regra dos filtros mora em um lugar só, e o
      // módulo continua puro, sem conhecer nome de tabela.
      credits: incomeReceipts.map((r) => ({
        amount: Number(r.amount),
        registeredAt: r.createdAt,
        occurredOn: storedDay(r.occurrenceDate),
      })),
      // Fora as linhas do fechamento de período antigo: a sobra devolvida ao
      // orçamento já estava na conta, e contá-la como movimento faria o saldo
      // andar sozinho uma vez a cada fechamento.
      debits: [
        ...transactions
          .filter((t) => !t.fromPeriodClose)
          .map((t) => ({
            amount: Number(t.amount),
            registeredAt: t.createdAt,
            occurredOn: storedDay(t.date),
          })),
        ...expensePayments.map((p) => ({
          amount: Number(p.amount),
          registeredAt: p.createdAt,
          // `paidAt`, não `dueDate`: o dinheiro sai quando se paga, e uma
          // fatura quitada adiantada sairia do saldo só no vencimento.
          occurredOn: p.paidAt,
        })),
        ...jarDeposits
          .filter((d) => !d.fromPeriodClose)
          .map((d) => ({
            amount: Number(d.amount),
            registeredAt: d.createdAt,
            occurredOn: d.createdAt,
          })),
      ],
    },
  };
}

/** O saldo em conta de agora, ou null quando o usuário nunca o informou. */
export function accountBalanceOf(inputs: BudgetInputs, today: Date): number | null {
  return calculateAccountBalance({ ...inputs.account, today });
}

/**
 * A mesma matéria-prima do saldo, somada sem marco: é o que o dialog mostra
 * como referência quando ainda não existe ajuste nenhum.
 */
export function registeredMovementOf(inputs: BudgetInputs, today: Date): number {
  return calculateRegisteredMovement({
    credits: inputs.account.credits,
    debits: inputs.account.debits,
    today,
  });
}
