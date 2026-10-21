/**
 * O extrato da conta do Nubank em PDF, lido pela POSIÇÃO do texto. A ordem
 * em que o PDF entrega os pedaços não segue a leitura: o valor de uma linha
 * pode vir antes dos detalhes, e os detalhes continuam no topo da página
 * seguinte. As colunas, essas, são fixas:
 *
 * - x ≈ 58: a data do dia ("01 OUT 2026");
 * - x ≈ 120: "Total de entradas"/"Total de saídas" (o sentido do bloco) ou o
 *   tipo do movimento ("Transferência enviada pelo Pix");
 * - x ≈ 262: os detalhes — quem, banco, conta —, em uma ou mais linhas;
 * - x ≥ 450: o valor, na altura do tipo.
 *
 * Puro: recebe os pedaços com posição (src/lib/statement/pdf.ts os tira do
 * arquivo) e devolve as linhas do extrato.
 */

export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
}

export interface StatementLine {
  /** O dia, como meia-noite UTC — o mesmo formato das datas do app. */
  date: Date;
  direction: "in" | "out";
  amount: number;
  /** "Transferência enviada pelo Pix", "Compra no débito via NuPay"… */
  type: string;
  /** Os detalhes juntos numa linha: "POSTO RODA MAIS 6 LTDA - 54.312.342/0001-76 - …". */
  detail: string;
  /**
   * Quem está do outro lado, quando o leitor do banco sabe dizer (Sicoob). Sem
   * isto, sai do começo de `detail` (Nubank).
   */
  counterparty?: string;
}

export interface ParsedStatement {
  /** O titular, do cabeçalho: é por ele que se reconhece a transferência entre contas próprias. */
  holder: string | null;
  /** O período que o extrato cobre, do cabeçalho; nulo se não deu para ler. */
  period: { start: Date; end: Date } | null;
  lines: StatementLine[];
}

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

const DATE = /^(\d{2}) ([A-Z]{3}) (\d{4})$/;
const AMOUNT = /^[+-]?\s*\d{1,3}(\.\d{3})*,\d{2}$/;

/** "1.234,56" → 1234.56. */
export function parseBrlAmount(text: string): number {
  return Number(text.replace(/[^\d,]/g, "").replace(",", "."));
}

const LONG_MONTHS: Record<string, number> = {
  JANEIRO: 0,
  FEVEREIRO: 1,
  MARÇO: 2,
  MARCO: 2,
  ABRIL: 3,
  MAIO: 4,
  JUNHO: 5,
  JULHO: 6,
  AGOSTO: 7,
  SETEMBRO: 8,
  OUTUBRO: 9,
  NOVEMBRO: 10,
  DEZEMBRO: 11,
};
const LONG_DATE = /^(\d{2}) DE ([A-ZÇ]+) DE (\d{4})$/;

/** O topo (nome, conta, período) e o rodapé (atendimento, "1 de 5") de toda página. */
function isChrome(item: PdfTextItem, pageTop: number): boolean {
  return item.y > pageTop - 90 || item.y < 125;
}

export function parseNubankStatement(pages: PdfTextItem[][]): ParsedStatement {
  let holder: string | null = null;
  let period: ParsedStatement["period"] = null;
  const lines: StatementLine[] = [];
  let date: Date | null = null;
  let direction: "in" | "out" | null = null;
  let current: StatementLine | null = null;

  for (const raw of pages) {
    const items = raw.filter((i) => i.str.trim() !== "");
    if (items.length === 0) continue;
    const pageTop = Math.max(...items.map((i) => i.y));
    // O titular é o primeiro texto do topo da primeira página, à direita.
    if (holder === null) {
      const top = items.filter((i) => i.y === pageTop).sort((a, b) => b.x - a.x)[0];
      holder = top?.str.trim() || null;
      const bounds = items
        .map((i) => LONG_DATE.exec(i.str.trim()))
        .filter((m): m is RegExpExecArray => m !== null && m[2] in LONG_MONTHS)
        .map(([, d, m, y]) => new Date(Date.UTC(Number(y), LONG_MONTHS[m], Number(d))))
        .sort((a, b) => a.getTime() - b.getTime());
      if (bounds.length >= 2) period = { start: bounds[0], end: bounds[bounds.length - 1] };
    }

    const body = items
      .filter((i) => !isChrome(i, pageTop))
      // De cima para baixo; na mesma altura, da esquerda para a direita.
      .sort((a, b) => b.y - a.y || a.x - b.x);

    for (const row of groupRows(body)) {
      const at = (min: number, max: number) =>
        row.filter((i) => i.x >= min && i.x < max).map((i) => i.str.trim());
      const dateText = at(0, 100).find((t) => DATE.test(t));
      const middle = at(100, 250).join(" ");
      const detail = at(250, 450).join(" ");
      const amountText = at(450, Infinity).find((t) => AMOUNT.test(t));

      if (dateText) {
        const [, day, month, year] = DATE.exec(dateText)!;
        date = new Date(Date.UTC(Number(year), MONTHS[month] ?? 0, Number(day)));
      }
      if (/^Total de entradas/i.test(middle)) {
        direction = "in";
        current = null;
        continue;
      }
      if (/^Total de sa[ií]das/i.test(middle)) {
        direction = "out";
        current = null;
        continue;
      }
      if (middle && amountText && date && direction) {
        current = {
          date,
          direction,
          amount: parseBrlAmount(amountText),
          type: middle,
          detail,
        };
        lines.push(current);
        continue;
      }
      // Só detalhe: continuação da linha anterior, mesmo vindo na página seguinte.
      if (!middle && detail && current) {
        current.detail = `${current.detail} ${detail}`.trim();
      }
    }
  }

  return { holder, period, lines };
}

/** Os pedaços na mesma altura (±2) viram uma linha, de cima para baixo, da esquerda para a direita. */
export function groupRows(items: PdfTextItem[]): PdfTextItem[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: { y: number; items: PdfTextItem[] }[] = [];
  for (const item of sorted) {
    const row = rows.find((r) => Math.abs(r.y - item.y) <= 2);
    if (row) row.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  }
  return rows.map((r) => r.items.sort((a, b) => a.x - b.x));
}
