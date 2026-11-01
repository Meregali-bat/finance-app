/**
 * O peso das faturas do cartão sobre a renda do próximo ciclo: o cartão dá a
 * sensação de que o dinheiro ainda está na conta, e o mês seguinte chega já
 * comprometido. Puro; a Início mostra quando passa de `ATTENTION_SHARE`.
 */

/** Daqui para cima, a Início avisa. */
export const ATTENTION_SHARE = 0.3;
/** Daqui para cima, o aviso é alerta. */
export const ALERT_SHARE = 0.5;

export interface NextCycleCommitment {
  periodStart: Date;
  income: number;
  cardBills: number;
  /** Faturas mais contas fixas. */
  committed: number;
  /** Faturas sobre a renda, de 0 a 1+. */
  cardShare: number;
  /** Faturas e contas fixas sobre a renda. */
  totalShare: number;
  /** Faturas e contas fixas passam do teto de comprometimento da pessoa. */
  overLimit: boolean;
  tone: "attention" | "alert";
}

export function nextCycleCommitment(
  next:
    | { periodStart: Date; expectedIncomeTotal: number; cardBillTotal: number; fixedExpenseTotal: number }
    | undefined,
  limitPercent: number,
): NextCycleCommitment | null {
  // A renda esperada, como no "posso comprar?": um salário ainda não marcado
  // não pode fazer o peso parecer o dobro.
  if (!next || next.expectedIncomeTotal <= 0) return null;
  const income = next.expectedIncomeTotal;
  const cardShare = next.cardBillTotal / income;
  if (cardShare < ATTENTION_SHARE - 1e-9) return null;
  const committed = next.cardBillTotal + next.fixedExpenseTotal;
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    periodStart: next.periodStart,
    income,
    cardBills: next.cardBillTotal,
    committed,
    cardShare: round(cardShare),
    totalShare: round(committed / income),
    overLimit: committed > income * (limitPercent / 100) + 0.005,
    tone: cardShare >= ALERT_SHARE ? "alert" : "attention",
  };
}
