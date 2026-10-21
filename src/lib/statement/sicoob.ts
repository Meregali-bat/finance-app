import {
  groupRows,
  parseBrlAmount,
  type ParsedStatement,
  type PdfTextItem,
  type StatementLine,
} from "@/lib/statement/nubank";

/**
 * O extrato de conta corrente do Sicoob (SISBR) em PDF. Cada movimento é uma
 * linha "DD/MM HISTÓRICO VALOR" — o valor termina em C (entrou) ou D (saiu) —,
 * seguida de linhas de detalhe: quem recebeu ou pagou, a loja, e o "DOC.:".
 * O ano sai do período no cabeçalho.
 *
 * Estornos ("EST.COMP VISA ELECT", "EST.DÉB.EMPRÉSTIMO") anulam o movimento
 * de mesmo valor e mesmo DOC: os dois somem, porque o dinheiro não saiu.
 */

const ROW_START = /^(\d{2})\/(\d{2})$/;
const VALUE = /^([\d.]+,\d{2})([CD])$/;
const PERIOD = /PER[IÍ]ODO:\s*(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2})\/(\d{2})\/(\d{4})/;
const ACCOUNT = /^CONTA:\s*[\d.\-]+\s*\/\s*(.+)$/;
/** CPF mascarado ou CNPJ: não é nome de ninguém. */
const DOCUMENT_ID = /^(\*{3}|[\d.]+\s+\d{4}-\d{2}$)/;

export function isSicoobStatement(pages: PdfTextItem[][]): boolean {
  const first = (pages[0] ?? []).map((i) => i.str);
  return first.some((t) => /EXTRATO CONTA CORRENTE/.test(t)) && first.some((t) => /SICOOB/.test(t));
}

interface Draft extends StatementLine {
  doc: string | null;
  details: string[];
}

export function parseSicoobStatement(pages: PdfTextItem[][]): ParsedStatement {
  let holder: string | null = null;
  let period: ParsedStatement["period"] = null;
  const drafts: Draft[] = [];
  let current: Draft | null = null;
  let finished = false;

  for (const page of pages) {
    if (finished) break;
    for (const row of groupRows(page.filter((i) => i.str.trim() !== ""))) {
      const text = row.map((i) => i.str.trim()).join(" ");
      if (/^RESUMO\b/.test(text)) {
        finished = true;
        break;
      }
      const account = ACCOUNT.exec(text);
      if (account && !holder) holder = account[1].trim();
      const range = PERIOD.exec(text);
      if (range && !period) {
        const [, d1, m1, y1, d2, m2, y2] = range;
        period = {
          start: new Date(Date.UTC(Number(y1), Number(m1) - 1, Number(d1))),
          end: new Date(Date.UTC(Number(y2), Number(m2) - 1, Number(d2))),
        };
      }

      const first = row[0]?.str.trim() ?? "";
      const last = row[row.length - 1]?.str.trim() ?? "";
      const day = ROW_START.exec(first);
      const value = VALUE.exec(last);
      if (day && value && row.length >= 3) {
        const type = row
          .slice(1, -1)
          .map((i) => i.str.trim())
          .join(" ");
        current = null;
        if (/^SALDO\b/.test(type)) continue;
        const endYear = period?.end.getUTCFullYear() ?? new Date().getFullYear();
        const endMonth = period?.end.getUTCMonth() ?? 11;
        const month = Number(day[2]) - 1;
        // Um extrato de dezembro a janeiro: o mês depois do fim é do ano anterior.
        const year = month > endMonth ? endYear - 1 : endYear;
        current = {
          date: new Date(Date.UTC(year, month, Number(day[1]))),
          direction: value[2] === "C" ? "in" : "out",
          amount: parseBrlAmount(value[1]),
          type,
          detail: "",
          doc: null,
          details: [],
        };
        drafts.push(current);
        continue;
      }
      // Linha de detalhe do movimento anterior, mesmo vinda na página seguinte.
      if (current && row[0] && row[0].x > 120) {
        if (/^DOC\.:/.test(text)) current.doc = text.replace(/^DOC\.:\s*/, "").trim();
        else current.details.push(text);
      }
    }
  }

  // Estorno e original de mesmo valor e DOC se anulam — o original do mesmo
  // dia primeiro, depois o mais próximo: o seguro cobrado três dias seguidos
  // e estornado em dois deles deixa de pé a cobrança certa.
  const cancelled = new Set<Draft>();
  for (const reversal of drafts) {
    if (!/^EST\./.test(reversal.type) || cancelled.has(reversal)) continue;
    const candidates = drafts.filter(
      (d) =>
        d !== reversal &&
        !cancelled.has(d) &&
        !/^EST\./.test(d.type) &&
        d.direction !== reversal.direction &&
        Math.round(d.amount * 100) === Math.round(reversal.amount * 100) &&
        d.doc === reversal.doc,
    );
    const gap = (d: Draft) => Math.abs(d.date.getTime() - reversal.date.getTime());
    const original = candidates.sort((a, b) => gap(a) - gap(b))[0];
    if (original) {
      cancelled.add(reversal);
      cancelled.add(original);
    }
  }

  const lines = drafts
    .filter((d) => !cancelled.has(d))
    .map(({ doc, details, ...line }) => ({
      ...line,
      detail: details.join(" - "),
      counterparty: whoOf(line.type, details, holder),
    }));
  return { holder, period, lines };
}

/** Quem está do outro lado, pelas linhas de detalhe do Sicoob. */
function whoOf(type: string, details: string[], holder: string | null): string {
  // Pix para conta da mesma titularidade.
  if (/IF-MSM/.test(type) && holder) return holder;
  const favored = details.find((d) => /^FAV\.:/.test(d));
  if (favored) return favored.replace(/^FAV\.:\s*/, "").trim();
  if (/^(EST\.)?COMP VISA/.test(type)) return (details[0] ?? "").replace(/\s+BR$/, "").trim();
  if (/^PIX/.test(type)) {
    // "Recebimento Pix" / "Pagamento Pix", depois o nome — ou só o CNPJ.
    const rest = details.filter((d) => !/^(Recebimento|Pagamento) Pix$/i.test(d));
    const name = rest.find((d) => !DOCUMENT_ID.test(d));
    if (name && !/^Pagamento referente/i.test(name)) return name;
    const id = rest.find((d) => /^[\d.]+\s+\d{4}-\d{2}$/.test(d));
    return id ? id.replace(/\s+/, "/") : "";
  }
  return "";
}
