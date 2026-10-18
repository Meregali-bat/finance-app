/**
 * Quem te deve, quanto e quando — puro, sem banco.
 *
 * Um empréstimo é uma despesa que alguém vai devolver: o dinheiro já saiu, e
 * a despesa conta no orçamento como qualquer outra. O que volta entra como
 * receita, também como qualquer outra. Este módulo só faz a conta de quem
 * ainda deve: o que cada pessoa pagou abate os empréstimos dela do mais
 * antigo para o mais novo, e cada empréstimo pode ter um combinado de
 * parcelas mensais.
 */

export interface LoanInput {
  id: string;
  personId: string;
  /** Quanto a pessoa deve por este empréstimo. */
  amount: number;
  /** O dia da despesa: ordena os empréstimos para o abatimento. */
  date: Date;
  /** Em quantas vezes ela combinou devolver. 1 = de uma vez. */
  installments: number;
  /** Vencimento da primeira parcela; as outras, mês a mês. Ausente = sem data. */
  firstDueDate?: Date;
}

export interface RepaymentInput {
  personId: string;
  amount: number;
}

export interface LoanStatus {
  id: string;
  amount: number;
  paid: number;
  remaining: number;
}

export interface NextInstallment {
  loanId: string;
  /** 1 = a primeira. */
  number: number;
  installments: number;
  dueDate: Date;
  /** O que falta desta parcela (menos, se já houve pagamento parcial). */
  amount: number;
  overdue: boolean;
}

export interface PersonDebt {
  personId: string;
  owed: number;
  paid: number;
  remaining: number;
  /** Do mais antigo para o mais novo. */
  loans: LoanStatus[];
  /** A próxima parcela combinada em aberto, se algum empréstimo tem data. */
  next?: NextInstallment;
  /** O dia do empréstimo mais antigo ainda em aberto. */
  since?: Date;
}

const CENT = 0.005;

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addMonthsClamped(date: Date, months: number) {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), lastDay));
}

/**
 * As parcelas combinadas de um empréstimo, com o valor acumulado até cada
 * uma. Os centavos que sobram da divisão vão na primeira, como nas parcelas
 * do cartão.
 */
export function loanSchedule(
  loan: Pick<LoanInput, "amount" | "installments" | "firstDueDate">,
): { number: number; dueDate: Date; cumulative: number }[] {
  if (!loan.firstDueDate) return [];
  const n = Math.max(1, Math.floor(loan.installments));
  const base = Math.floor((loan.amount / n) * 100) / 100;
  const first = round2(loan.amount - base * (n - 1));
  const schedule = [];
  let cumulative = 0;
  for (let i = 0; i < n; i++) {
    cumulative = round2(cumulative + (i === 0 ? first : base));
    schedule.push({
      number: i + 1,
      dueDate: addMonthsClamped(startOfDay(loan.firstDueDate), i),
      cumulative,
    });
  }
  return schedule;
}

/** Quanto cada pessoa ainda deve. Só quem tem saldo em aberto aparece. */
export function summarizeDebts(input: {
  loans: LoanInput[];
  repayments: RepaymentInput[];
  today: Date;
}): PersonDebt[] {
  const todayStart = startOfDay(input.today);
  const people = new Map<string, LoanInput[]>();
  for (const loan of input.loans) {
    const list = people.get(loan.personId) ?? [];
    list.push(loan);
    people.set(loan.personId, list);
  }

  const debts: PersonDebt[] = [];
  for (const [personId, list] of people) {
    const loans = [...list].sort((a, b) => a.date.getTime() - b.date.getTime());
    const owed = round2(loans.reduce((sum, l) => sum + l.amount, 0));
    const paid = round2(
      input.repayments.filter((r) => r.personId === personId).reduce((s, r) => s + r.amount, 0),
    );

    // O pago abate do mais antigo para o mais novo.
    let pool = paid;
    const statuses: LoanStatus[] = loans.map((loan) => {
      const applied = Math.min(loan.amount, Math.max(0, pool));
      pool = round2(pool - applied);
      return {
        id: loan.id,
        amount: loan.amount,
        paid: round2(applied),
        remaining: round2(loan.amount - applied),
      };
    });

    const remaining = round2(owed - paid);
    if (remaining <= CENT) continue;

    let next: NextInstallment | undefined;
    loans.forEach((loan, i) => {
      const status = statuses[i];
      if (status.remaining <= CENT) return;
      const pending = loanSchedule(loan).find((s) => s.cumulative - status.paid > CENT);
      if (!pending) return;
      const candidate: NextInstallment = {
        loanId: loan.id,
        number: pending.number,
        installments: Math.max(1, Math.floor(loan.installments)),
        dueDate: pending.dueDate,
        amount: round2(pending.cumulative - status.paid),
        overdue: pending.dueDate.getTime() < todayStart.getTime(),
      };
      if (!next || candidate.dueDate.getTime() < next.dueDate.getTime()) next = candidate;
    });

    const oldestOpen = loans.find((_, i) => statuses[i].remaining > CENT);
    debts.push({
      personId,
      owed,
      paid,
      remaining,
      loans: statuses,
      ...(next ? { next } : {}),
      ...(oldestOpen ? { since: oldestOpen.date } : {}),
    });
  }

  // Quem tem parcela vencida primeiro, depois pela próxima data, depois pelo
  // empréstimo mais antigo.
  return debts.sort((a, b) => {
    const ka = a.next ? a.next.dueDate.getTime() : (a.since?.getTime() ?? 0) + 1e13;
    const kb = b.next ? b.next.dueDate.getTime() : (b.since?.getTime() ?? 0) + 1e13;
    return ka - kb;
  });
}
