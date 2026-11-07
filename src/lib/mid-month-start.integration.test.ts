import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * O começo no meio do mês de ponta a ponta, pelas server actions, contra um
 * Postgres de verdade. Como db.integration.test.ts, só roda com
 * DB_INTEGRATION=1 e DATABASE_URL de um banco descartável.
 *
 * A pessoa cadastra o salário que caiu hoje e diz que já caiu, informa o saldo,
 * cadastra o aluguel que vence hoje e diz que já pagou, e depois paga a
 * internet pelo lembrete dizendo que já tinha saído do saldo. O saldo em conta
 * e o número do período têm que continuar sendo o saldo informado, e nenhum dos
 * três pode sobrar nos lembretes.
 */
const enabled = process.env.DB_INTEGRATION === "1";

const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/auth-helpers", () => ({ requireUserId: async () => session.userId }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));

describe.skipIf(!enabled)("começar no meio do mês, no banco", async () => {
  const { prisma } = await import("@/lib/prisma");
  const { createIncome } = await import("@/lib/actions/income");
  const { createFixedExpense } = await import("@/lib/actions/expense");
  const { setAccountBalance } = await import("@/lib/actions/account-balance");
  const { markFixedExpensePaid } = await import("@/lib/actions/expense-payment");
  const { discardOnboardingExpense, discardOnboardingIncome } = await import(
    "@/lib/actions/onboarding"
  );
  const { loadBudgetInputs, accountBalanceOf } = await import("@/lib/budget-inputs");
  const { calculateCurrentBudget } = await import("@/lib/carry-over");

  const tag = `mm-${Date.now()}`;
  const today = new Date().getDate();
  let userId: string;

  function form(fields: Record<string, string>) {
    const data = new FormData();
    for (const [k, v] of Object.entries(fields)) data.set(k, v);
    return data;
  }

  async function budget() {
    const inputs = await loadBudgetInputs(userId);
    const now = new Date();
    const accountBalance = accountBalanceOf(inputs, now);
    return { accountBalance, budget: calculateCurrentBudget({ ...inputs, today: now, accountBalance }) };
  }

  beforeAll(async () => {
    userId = (await prisma.user.create({ data: { email: `${tag}@x.test`, passwordHash: "x" } })).id;
    session.userId = userId;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("salário 'já caiu': confirma o recebimento de hoje", async () => {
    await createIncome(
      form({ label: "Salário", amount: "3000", dayOfMonth: String(today), receivedThisMonth: "1" }),
    );
    const receipts = await prisma.incomeReceipt.findMany({ where: { userId } });
    expect(receipts).toHaveLength(1);
    expect(Number(receipts[0].amount)).toBe(3000);
  });

  it("aluguel 'já paguei': quita o vencimento de hoje sem sair do saldo", async () => {
    await setAccountBalance(form({ balance: "1500" }));
    await createFixedExpense(
      form({ label: "Aluguel", amount: "1000", dueDay: String(today), paidThisMonth: "1" }),
    );
    const payments = await prisma.expensePayment.findMany({ where: { userId } });
    expect(payments).toHaveLength(1);

    const { accountBalance, budget: b } = await budget();
    expect(accountBalance).toBe(1500);
    expect(b.incomeReminders).toEqual([]);
    expect(b.fixedExpenseReminders).toEqual([]);
    expect(b.periodBalance).toBe(1500);
  });

  it("sem a marca, a conta fica pendente e sai do número", async () => {
    await createFixedExpense(form({ label: "Internet", amount: "100", dueDay: String(today) }));
    const { budget: b } = await budget();
    expect(b.fixedExpenseReminders).toHaveLength(1);
    expect(b.periodBalance).toBe(1400);
  });

  it("pago pelo lembrete com 'já tinha saído do saldo': não sai de novo", async () => {
    const { budget: before } = await budget();
    const reminder = before.fixedExpenseReminders[0];
    await markFixedExpensePaid(
      reminder.expenseId,
      form({ dueDate: reminder.dueDate.toISOString(), amount: "100", inReading: "1" }),
    );
    const { accountBalance, budget: b } = await budget();
    expect(b.fixedExpenseReminders).toEqual([]);
    expect(accountBalance).toBe(1500);
    expect(b.periodBalance).toBe(1500);
  });

  it("tirar no primeiro uso leva junto o pagamento e o recebimento", async () => {
    const rent = await prisma.fixedExpense.findFirstOrThrow({ where: { userId, label: "Aluguel" } });
    const salary = await prisma.income.findFirstOrThrow({ where: { userId } });
    await discardOnboardingExpense(rent.id);
    await discardOnboardingIncome(salary.id);
    expect(await prisma.expensePayment.count({ where: { fixedExpenseId: rent.id } })).toBe(0);
    expect(await prisma.incomeReceipt.count({ where: { userId } })).toBe(0);
  });

  it("depois do primeiro uso, tirar assim é recusado", async () => {
    await prisma.user.update({ where: { id: userId }, data: { onboardedAt: new Date() } });
    const internet = await prisma.fixedExpense.findFirstOrThrow({ where: { userId } });
    await expect(discardOnboardingExpense(internet.id)).rejects.toThrow("O primeiro uso já terminou");
    expect(await prisma.fixedExpense.count({ where: { id: internet.id } })).toBe(1);
  });
});
