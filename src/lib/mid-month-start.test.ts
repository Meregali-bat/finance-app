import { describe, expect, it } from "vitest";
import { calculateAccountBalance, paidBeforeReading } from "./account-balance";
import type { AccountMovementInput } from "./account-balance";
import {
  arrivedPaydayToConfirm,
  calculateDailyBudget,
  thisMonthDueStillAhead,
  type BudgetInput,
  type ExpensePaymentInput,
  type IncomeReceiptInput,
} from "./period";

/**
 * Quem começa no meio do mês: o salário do dia 5 já caiu, o aluguel do dia 10
 * já foi pago, e no dia 7 a pessoa cadastra os dois e informa o saldo do
 * banco — que já tem o salário e já não tem o aluguel. Nada disso pode
 * aparecer como pendente, nem sair do saldo uma segunda vez.
 */
const signup = new Date(2026, 10, 7, 9, 0);
const readingAt = new Date(2026, 10, 7, 9, 2);
const now = new Date(2026, 10, 7, 9, 10);
const BALANCE = 1500;

const income = { id: "salario", amount: 3000, dayOfMonth: 5, createdAt: signup };
const rent = { id: "aluguel", amount: 1000, dueDay: 10, createdAt: signup };

function budgetWith({
  payments = [],
  receipts = [],
}: {
  payments?: (ExpensePaymentInput & { paidAt: Date; createdAt: Date })[];
  receipts?: (IncomeReceiptInput & { createdAt: Date })[];
}) {
  const debits: AccountMovementInput[] = payments.map((p) => ({
    amount: p.amount,
    registeredAt: p.createdAt,
    occurredOn: p.paidAt,
  }));
  const credits: AccountMovementInput[] = receipts.map((r) => ({
    amount: r.amount,
    registeredAt: r.createdAt,
    occurredOn: r.occurrenceDate,
  }));
  const accountBalance = calculateAccountBalance({
    adjustment: { balance: BALANCE, createdAt: readingAt },
    credits,
    debits,
    today: now,
  });
  const input: BudgetInput = {
    incomes: [income],
    incomeReceipts: receipts,
    fixedExpenses: [rent],
    creditCards: [],
    cardPurchases: [],
    expensePayments: payments,
    transactions: [],
    today: now,
  };
  return { accountBalance, budget: calculateDailyBudget({ ...input, accountBalance }) };
}

describe("começar no meio do mês", () => {
  it("sem marcar nada, cobra o aluguel já pago e pergunta do salário já recebido", () => {
    // O bug relatado: os dois aparecem como pendentes, e o aluguel sai do
    // saldo que já não o tinha.
    const { budget } = budgetWith({});
    expect(budget.fixedExpenseReminders).toHaveLength(1);
    expect(budget.incomeReminders).toHaveLength(1);
    expect(budget.periodBalance).toBe(BALANCE - 1000);
  });

  it("marcar o aluguel como pago hoje, do jeito comum, ainda tira do saldo de novo", () => {
    // Pago no dia da leitura e marcado depois dela: o cálculo não tem como
    // saber a ordem e conta, pelo lado seguro. É por isso que existe o aviso.
    const { accountBalance, budget } = budgetWith({
      payments: [
        {
          fixedExpenseId: "aluguel",
          dueDate: new Date(2026, 10, 10),
          amount: 1000,
          paidAt: now,
          createdAt: now,
        },
      ],
    });
    expect(budget.fixedExpenseReminders).toEqual([]);
    expect(accountBalance).toBe(BALANCE - 1000);
  });

  it("aluguel marcado como já fora do saldo: some dos lembretes e não sai de novo", () => {
    const { paidAt, createdAt } = paidBeforeReading(now, readingAt);
    const { accountBalance, budget } = budgetWith({
      payments: [
        {
          fixedExpenseId: "aluguel",
          dueDate: new Date(2026, 10, 10),
          amount: 1000,
          paidAt,
          createdAt,
        },
      ],
    });
    expect(budget.fixedExpenseReminders).toEqual([]);
    expect(accountBalance).toBe(BALANCE);
    expect(budget.periodBalance).toBe(BALANCE);
  });

  it("salário confirmado depois da leitura não entra no saldo de novo", () => {
    const payday = arrivedPaydayToConfirm(income, now);
    expect(payday).toEqual(new Date(2026, 10, 5));
    const { accountBalance, budget } = budgetWith({
      receipts: [{ incomeId: "salario", occurrenceDate: payday!, amount: 3000, createdAt: now }],
    });
    expect(budget.incomeReminders).toEqual([]);
    expect(accountBalance).toBe(BALANCE);
    expect(budget.periodBalance).toBe(BALANCE - 1000);
  });

  it("com os dois resolvidos, o número parte só do saldo informado", () => {
    const { paidAt, createdAt } = paidBeforeReading(now, readingAt);
    const { budget } = budgetWith({
      payments: [
        { fixedExpenseId: "aluguel", dueDate: new Date(2026, 10, 10), amount: 1000, paidAt, createdAt },
      ],
      receipts: [
        { incomeId: "salario", occurrenceDate: new Date(2026, 10, 5), amount: 3000, createdAt: now },
      ],
    });
    expect(budget.fixedExpenseReminders).toEqual([]);
    expect(budget.incomeReminders).toEqual([]);
    expect(budget.periodBalance).toBe(BALANCE);
  });
});

describe("paidBeforeReading", () => {
  it("põe o registro um instante antes da leitura", () => {
    expect(paidBeforeReading(now, readingAt).createdAt).toEqual(new Date(readingAt.getTime() - 1));
  });

  it("um 'hoje' depois da leitura vira o instante da leitura", () => {
    expect(paidBeforeReading(now, readingAt).paidAt).toEqual(readingAt);
  });

  it("mantém a data anterior que a pessoa escolheu", () => {
    const earlier = new Date(2026, 10, 3);
    expect(paidBeforeReading(earlier, readingAt).paidAt).toEqual(earlier);
  });

  it("vale também para leitura de dias atrás", () => {
    // Saldo informado dia 2, conta paga dia 1 e marcada só hoje com a data de
    // hoje: a pessoa diz que já estava fora do saldo, e o saldo fica.
    const oldReading = new Date(2026, 10, 2, 8, 0);
    const { paidAt, createdAt } = paidBeforeReading(now, oldReading);
    const balance = calculateAccountBalance({
      adjustment: { balance: BALANCE, createdAt: oldReading },
      credits: [],
      debits: [{ amount: 1000, registeredAt: createdAt, occurredOn: paidAt }],
      today: now,
    });
    expect(balance).toBe(BALANCE);
  });
});

describe("arrivedPaydayToConfirm", () => {
  it("o pagamento de poucos dias antes do cadastro", () => {
    expect(arrivedPaydayToConfirm(income, now)).toEqual(new Date(2026, 10, 5));
  });

  it("o pagamento de hoje", () => {
    expect(arrivedPaydayToConfirm({ ...income, dayOfMonth: 7 }, now)).toEqual(
      new Date(2026, 10, 7),
    );
  });

  it("nada quando o dia ainda não chegou neste mês", () => {
    // O último seria 20/out, longe demais antes do cadastro: o lembrete não
    // perguntaria, e confirmar poria no período dinheiro de antes do app.
    expect(arrivedPaydayToConfirm({ ...income, dayOfMonth: 20 }, now)).toBeNull();
  });
});

describe("thisMonthDueStillAhead", () => {
  it("o vencimento de mais adiante no mês", () => {
    expect(thisMonthDueStillAhead(10, now)).toEqual(new Date(2026, 10, 10));
  });

  it("o vencimento de hoje", () => {
    expect(thisMonthDueStillAhead(7, now)).toEqual(new Date(2026, 10, 7));
  });

  it("nada quando já venceu: a ocorrência é de antes do cadastro e nunca contou", () => {
    expect(thisMonthDueStillAhead(3, now)).toBeNull();
  });

  it("dia 31 num mês de 30 cai no último dia", () => {
    expect(thisMonthDueStillAhead(31, now)).toEqual(new Date(2026, 10, 30));
  });
});
