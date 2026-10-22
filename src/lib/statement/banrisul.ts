import {
  groupRows,
  parseBrlAmount,
  type ParsedStatement,
  type PdfTextItem,
  type StatementLine,
} from "@/lib/statement/nubank";

/**
 * O extrato de conta corrente do Banrisul em PDF ("PARA SIMPLES
 * CONFERENCIA"), em fonte de máquina de escrever — as colunas são fixas:
 *
 * - x ≈ 36: o dia ("02"), só na primeira linha do dia;
 * - x ≈ 65: o histórico ("PIX", "PIX RECEBIDO", "IOF ADICIONAL"), e na linha
 *   de baixo, em x ≈ 72, "NOME: quem está do outro lado";
 * - x ≈ 209: o documento;
 * - x ≥ 330: o valor, com "-" no fim quando saiu.
 *
 * O mês e o ano vêm do cabeçalho "MOVIMENTOS OUT/2026", que se repete na
 * virada do mês. As linhas "SALDO NA DATA" e "SALDO ANT EM" são saldo, não
 * movimento.
 */

const MONTHS: Record<string, number> = {
  JAN: 0,
  FEV: 1,
  MAR: 2,
  ABR: 3,
  MAI: 4,
  JUN: 5,
  JUL: 6,
  AGO: 7,
  SET: 8,
  OUT: 9,
  NOV: 10,
  DEZ: 11,
};

const MONTH_HEADER = /MOVIMENTOS (JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\/(\d{4})/;
const VALUE = /^([\d.]+,\d{2})(-?)$/;
const OPENING = /SALDO ANT EM (\d{2})\/(\d{2})\/(\d{4})/;
const ISSUED = /EXTRATO EMITIDO AS [\d:]+ DE (\d{2})\/(\d{2})\/(\d{4})/;
/** O titular no cabeçalho: "NOME...: FULANA". O "NOME:" sem pontos é de um movimento. */
const HOLDER = /^NOME\.+:\s*(.+)$/;

export function isBanrisulStatement(pages: PdfTextItem[][]): boolean {
  const first = pages[0] ?? [];
  // O nome do banco vem espaçado, letra por letra: "B A N R I S U L".
  const squeezed = first
    .map((i) => i.str)
    .join("")
    .replace(/\s+/g, "");
  return squeezed.includes("BANRISUL") && first.some((i) => /MOVIMENTOS DA CONTA/.test(i.str));
}

export function parseBanrisulStatement(pages: PdfTextItem[][]): ParsedStatement {
  let holder: string | null = null;
  let start: Date | null = null;
  let end: Date | null = null;
  let month: { year: number; index: number } | null = null;
  let day: number | null = null;
  let inMovements = false;
  let current: StatementLine | null = null;
  const lines: StatementLine[] = [];

  for (const page of pages) {
    for (const row of groupRows(page.filter((i) => i.str.trim() !== ""))) {
      const at = (min: number, max: number) =>
        row
          .filter((i) => i.x >= min && i.x < max)
          .map((i) => i.str.trim())
          .join(" ")
          .replace(/\s+/g, " ");
      const text = at(0, Infinity);

      const name = HOLDER.exec(text);
      if (name && !holder) holder = name[1].trim();
      const opening = OPENING.exec(text);
      if (opening) {
        const [, d, m, y] = opening.map(Number);
        start = new Date(Date.UTC(y, m - 1, d + 1));
      }
      const issued = ISSUED.exec(text);
      if (issued) {
        const [, d, m, y] = issued.map(Number);
        end = new Date(Date.UTC(y, m - 1, d));
        inMovements = false;
        continue;
      }
      if (/MOVIMENTOS DA CONTA/.test(text)) {
        inMovements = true;
        continue;
      }
      const header = MONTH_HEADER.exec(text);
      if (header) {
        month = { year: Number(header[2]), index: MONTHS[header[1]] };
        day = null;
        continue;
      }
      if (!inMovements) continue;

      const dayText = at(0, 55);
      if (/^\d{2}$/.test(dayText)) day = Number(dayText);
      const history = at(55, 200);
      const value = VALUE.exec(at(300, Infinity));

      if (/^NOME:/.test(history)) {
        if (current) {
          current.detail = history.replace(/^NOME:\s*/, "").trim();
          // "62.071.278 FULANA DE TAL": o CNPJ do MEI na frente não é nome.
          current.counterparty = current.detail.replace(/^[\d./-]+\s+/, "");
        }
        continue;
      }
      if (/^SALDO\b/.test(history)) {
        current = null;
        continue;
      }
      if (history && value && month && day) {
        current = {
          date: new Date(Date.UTC(month.year, month.index, day)),
          direction: value[2] === "-" ? "out" : "in",
          amount: parseBrlAmount(value[1]),
          type: history,
          detail: "",
        };
        lines.push(current);
      }
    }
  }

  return { holder, period: start && end ? { start, end } : null, lines };
}
