import { normalizeName } from "@/lib/shortcut";
import type { StatementLine } from "@/lib/statement/nubank";

/**
 * Conferir o extrato com o app: o que cada linha é, e se já está lançada.
 * Puro; a action em src/lib/actions/statement.ts carrega os dados e grava.
 */

export type LineKind =
  /** O titular dos dois lados: dinheiro entre as próprias contas, que não muda o saldo somado. */
  | "ownTransfer"
  /** Aplicação e resgate de RDB: investimento, fora do app. */
  | "investment"
  /** Pagamento da fatura do cartão: as compras já contam, nunca vira gasto. */
  | "billPayment"
  /** Gasto ou recebimento de verdade. */
  | "movement";

/** Quem está do outro lado: o começo dos detalhes, antes do primeiro " - ", sem CNPJ na frente. */
export function counterparty(detail: string): string {
  const head = detail.split(" - ")[0] ?? "";
  return head.replace(/^[\d.]+\s+/, "").trim();
}

export function classifyLine(line: StatementLine, holder: string | null): LineKind {
  if (/\bRDB\b/i.test(line.type)) return "investment";
  if (/^Pagamento de fatura/i.test(line.type)) return "billPayment";
  if (holder && normalizeName(counterparty(line.detail)) === normalizeName(holder)) {
    return "ownTransfer";
  }
  return "movement";
}

const LOWER = new Set(["de", "da", "do", "das", "dos", "e"]);

/** "POSTO RODA MAIS 6 LTDA" → "Posto Roda Mais 6 Ltda". */
function titleCase(text: string): string {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word, i) => (i > 0 && LOWER.has(word) ? word : word[0].toUpperCase() + word.slice(1)))
    .join(" ");
}

/** A descrição do lançamento que a linha viraria: curta e reconhecível. */
export function describeLine(line: StatementLine): string {
  const who = counterparty(line.detail);
  if (/^Transfer[eê]ncia (enviada|recebida)/i.test(line.type) && who) {
    return `${line.direction === "out" ? "Pix para" : "Pix de"} ${titleCase(who)}`.slice(0, 120);
  }
  if (/^Compra no d[eé]bito/i.test(line.type) && line.detail) {
    // "EBW*Spotify": o que vem depois do asterisco é a loja.
    const merchant = line.detail.includes("*") ? line.detail.split("*").pop()! : line.detail;
    return titleCase(merchant.trim()).slice(0, 120);
  }
  if (/^Pagamento de boleto/i.test(line.type) && line.detail) {
    return `Boleto ${titleCase(line.detail)}`.slice(0, 120);
  }
  return (line.detail ? `${line.type} ${titleCase(who || line.detail)}` : line.type).slice(0, 120);
}

/**
 * Uma impressão estável da linha, para lembrar o que foi ignorado: a mesma
 * linha de um extrato que cobre os mesmos dias dá a mesma impressão. Linhas
 * idênticas no mesmo dia se separam pela ordem.
 */
export function fingerprints(lines: StatementLine[]): string[] {
  const seen = new Map<string, number>();
  return lines.map((line) => {
    const base = [
      line.date.toISOString().slice(0, 10),
      line.direction,
      Math.round(line.amount * 100),
      normalizeName(`${line.type} ${counterparty(line.detail)}`),
    ].join("|");
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return `${base}|${n}`;
  });
}

/** Um registro do app que mexe na conta: o que uma linha do extrato pode conferir. */
export interface AppMovement {
  /** O dia, como número de dias desde a época (sem fuso). */
  day: number;
  /** Positivo = saiu da conta; negativo = entrou. */
  amount: number;
  kind: "transaction" | "income" | "fixedPayment" | "billPayment" | "jar";
}

/** Um dia de calendário, gravado como meia-noite UTC, em número de dias. */
export function utcDay(date: Date): number {
  return Math.floor(date.getTime() / 86_400_000);
}

/** Um instante (pagamento, caixinha) no dia local, em número de dias. */
export function localDay(instant: Date): number {
  return utcDay(new Date(Date.UTC(instant.getFullYear(), instant.getMonth(), instant.getDate())));
}

export interface ReconciledLine {
  line: StatementLine;
  fingerprint: string;
  kind: LineKind;
  description: string;
  /** Achou no app um registro com o mesmo valor e data próxima. */
  matched: boolean;
}

/**
 * Para cada linha, se o app já tem algo que a explique. Cada registro do app
 * confere uma linha só, a de data mais próxima; rendas aceitam até 3 dias de
 * diferença (o salário cai antes ou depois do dia), o resto até 2.
 */
export function reconcile(
  lines: StatementLine[],
  holder: string | null,
  app: AppMovement[],
): ReconciledLine[] {
  const prints = fingerprints(lines);
  const used = new Set<number>();
  const cents = (n: number) => Math.round(n * 100);

  return lines.map((line, index) => {
    const kind = classifyLine(line, holder);
    const signed = line.direction === "out" ? line.amount : -line.amount;
    let matched = false;

    if (kind === "movement" || kind === "billPayment") {
      const day = utcDay(line.date);
      let best = -1;
      let bestGap = Infinity;
      app.forEach((m, i) => {
        if (used.has(i) || cents(m.amount) !== cents(signed)) return;
        if (kind === "billPayment" ? m.kind !== "billPayment" : m.kind === "billPayment") return;
        const gap = Math.abs(m.day - day);
        if (gap > (m.kind === "income" ? 3 : 2) || gap >= bestGap) return;
        best = i;
        bestGap = gap;
      });
      if (best >= 0) {
        used.add(best);
        matched = true;
      }
    }

    return { line, fingerprint: prints[index], kind, description: describeLine(line), matched };
  });
}
