/**
 * Conferir uma importação de extrato com a IA: ela lê o PDF por conta própria
 * e aponta o que está errado nos lançamentos do app. Aqui, puro, o que vale do
 * que ela disse e qual correção cada problema propõe. Nada é gravado sem a
 * pessoa tocar em Corrigir.
 */

export type IssueKind = "amount" | "ownTransfer" | "duplicate" | "direction" | "other";

/** Um lançamento do app no período, assinado como no banco: positivo saiu, negativo entrou. */
export interface AppRecord {
  id: string;
  /** "YYYY-MM-DD". */
  date: string;
  description: string;
  amount: number;
}

/** Um problema como a IA devolveu. */
export interface RawIssue {
  kind: IssueKind;
  /** O lançamento do app; nulo em "outra coisa" sem lançamento. */
  transactionId: string | null;
  statementDate: string | null;
  statementDescription: string | null;
  /** O valor no extrato, sem sinal. */
  statementAmount: number | null;
  explanation: string;
}

export type Fix = { type: "amount"; amount: number } | { type: "delete" } | null;

export interface ReviewIssue extends RawIssue {
  record: AppRecord | null;
  fix: Fix;
}

const cents = (n: number) => Math.round(n * 100);

/**
 * Só o que dá para mostrar e corrigir: o lançamento precisa ser um dos que
 * foram para a IA, e cada um aparece uma vez. Valor diferente mantém o
 * sentido do lançamento (uma receita continua receita); um valor que já bate
 * não é problema.
 */
export function reviewFixes(issues: RawIssue[], records: AppRecord[]): ReviewIssue[] {
  const byId = new Map(records.map((r) => [r.id, r]));
  const seen = new Set<string>();
  const result: ReviewIssue[] = [];
  for (const issue of issues) {
    if (issue.kind === "other" && !issue.transactionId) {
      result.push({ ...issue, record: null, fix: null });
      continue;
    }
    const record = issue.transactionId ? byId.get(issue.transactionId) : undefined;
    if (!record || seen.has(record.id)) continue;
    let fix: Fix = null;
    if (issue.kind === "amount") {
      const value = Math.abs(issue.statementAmount ?? 0);
      if (value === 0 || cents(value) === cents(Math.abs(record.amount))) continue;
      fix = { type: "amount", amount: record.amount < 0 ? -value : value };
    } else if (issue.kind === "direction") {
      fix = { type: "amount", amount: -record.amount };
    } else if (issue.kind === "ownTransfer" || issue.kind === "duplicate") {
      fix = { type: "delete" };
    }
    seen.add(record.id);
    result.push({ ...issue, record, fix });
  }
  return result;
}
