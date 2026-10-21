import { groupRows, parseBrlAmount, type PdfTextItem } from "@/lib/statement/nubank";

/**
 * A fatura do cartão de crédito do Sicoob (Sicoobcard) em PDF.
 *
 * Os lançamentos ficam numa página em DUAS colunas lado a lado, cada uma com
 * data, descrição, cidade e valor. Um lançamento pode ocupar mais de uma
 * linha: a parcela ("05/08") fica embaixo da descrição, e a compra em dólar
 * tem o valor em reais, o valor em dólar e a cotação em linhas extras — com o
 * "R$ 110,00" aparecendo duas vezes. Por isso cada lançamento é lido a partir
 * da sua data (a âncora), juntando o que está na faixa de altura dela, dentro
 * da sua coluna.
 */

export interface CardBillLine {
  /** O dia da compra (a original, numa parcelada), como meia-noite UTC. */
  date: Date;
  description: string;
  city: string;
  /** O valor cobrado nesta fatura: a parcela, numa compra parcelada. */
  amount: number;
  /** "05/08" → { current: 5, total: 8 }; nulo à vista. */
  installment: { current: number; total: number } | null;
  /** Tarifa ou encargo do banco (IOF, proteção), e não compra numa loja. */
  fee: boolean;
}

export interface CardBillStatement {
  /** "SICOOB VISA GOLD". */
  cardName: string | null;
  closingDate: Date | null;
  dueDate: Date | null;
  total: number | null;
  lines: CardBillLine[];
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
const ANCHOR = /^(\d{2}) (JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)$/;
const MONEY = /^-?R\$\s?[\d.]+,\d{2}$/;
const INSTALLMENT = /^(\d{2})\/(\d{2})$/;
/** Linhas de dólar e cotação de uma compra internacional: não fazem parte do nome. */
const FOREIGN = /^(U\$|V\.DOL|R\$)/;
/** O cabeçalho das colunas, que se repete entre os blocos. */
const HEADER = /^(DATA|DESCRIÇÃO|CIDADE|VALOR EM R\$)$/;

export function isSicoobCardBill(pages: PdfTextItem[][]): boolean {
  return pages.some((page) =>
    page.some((i) => /DATA DE FECHAMENTO DA FATURA|LANÇAMENTOS - SICOOB/.test(i.str)),
  );
}

export function parseSicoobCardBill(pages: PdfTextItem[][]): CardBillStatement {
  const text = pages.map((p) =>
    groupRows(p)
      .map((r) => r.map((i) => i.str).join(" "))
      .join("\n"),
  );
  const all = text.join("\n");

  const closing = /DATA DE FECHAMENTO DA FATURA\s*(\d{2})\/(\d{2})\/(\d{4})/.exec(all);
  const closingDate = closing
    ? new Date(Date.UTC(Number(closing[3]), Number(closing[2]) - 1, Number(closing[1])))
    : null;
  const due = /VENCIMENTO[\s\S]{0,40}?(\d{2}) ([A-Z]{3}) (\d{4})/.exec(all);
  const dueDate =
    due && due[2] in MONTHS
      ? new Date(Date.UTC(Number(due[3]), MONTHS[due[2]], Number(due[1])))
      : null;
  // "no valor total de R$ 2.877,46", na capa; senão, o último "TOTAL R$" da lista.
  const totalMatch =
    /valor total de\s*R\$\s?([\d.]+,\d{2})/i.exec(all) ??
    [...all.matchAll(/^TOTAL\s+R\$\s?([\d.]+,\d{2})$/gm)].pop() ??
    null;
  const total = totalMatch ? parseBrlAmount(totalMatch[1]) : null;
  const cardName = /LANÇAMENTOS - (.+)/.exec(all)?.[1].trim() ?? null;

  const lines: CardBillLine[] = [];
  for (const page of pages) {
    const items = page.filter((i) => i.str.trim() !== "");
    // As colunas começam onde há datas: a da esquerda perto de x=28, a da direita perto de 305.
    const anchors = items.filter((i) => ANCHOR.test(i.str.trim()));
    if (anchors.length === 0) continue;
    const columnStarts = [...new Set(anchors.map((a) => Math.round(a.x / 20) * 20))].sort(
      (a, b) => a - b,
    );

    columnStarts.forEach((start, index) => {
      const end = columnStarts[index + 1] ?? Infinity;
      const inColumn = items.filter((i) => i.x >= start - 15 && i.x < end - 15);
      const dates = inColumn
        .filter((i) => ANCHOR.test(i.str.trim()) && i.x < start + 15)
        .sort((a, b) => b.y - a.y);

      dates.forEach((anchor, k) => {
        // A faixa do lançamento começa um pouco acima da data (a descrição de
        // duas linhas sobe 4pt) e desce até logo acima do próximo lançamento —
        // a compra em dólar tem duas linhas a mais embaixo. Nunca mais de 22pt
        // para baixo, para não pegar o "TOTAL" do fim da coluna.
        const top = anchor.y + 6;
        const bottom = Math.max(
          k === dates.length - 1 ? -Infinity : dates[k + 1].y + 6,
          anchor.y - 22,
        );
        const band = inColumn.filter(
          (i) => i !== anchor && i.y < top && i.y > bottom && !HEADER.test(i.str.trim()),
        );
        const x0 = anchor.x;

        // O valor é o da coluna da direita mais perto da altura da data.
        const value = band
          .filter((i) => i.x >= x0 + 190 && MONEY.test(i.str.trim()))
          .sort((a, b) => Math.abs(a.y - anchor.y) - Math.abs(b.y - anchor.y))[0];
        if (!value) return;
        const signed = value.str.trim().startsWith("-");
        // Pagamento recebido: é a fatura anterior sendo paga, não compra.
        if (signed) return;

        const descriptionItems = band
          .filter((i) => i.x >= x0 + 30 && i.x < x0 + 130)
          .sort((a, b) => b.y - a.y || a.x - b.x);
        const installmentText = descriptionItems
          .map((i) => i.str.trim())
          .find((t) => INSTALLMENT.test(t));
        const description = descriptionItems
          .map((i) => i.str.trim())
          .filter((t) => !INSTALLMENT.test(t) && !FOREIGN.test(t))
          .join(" ");
        const city = band
          .filter((i) => i.x >= x0 + 130 && i.x < x0 + 190 && !FOREIGN.test(i.str.trim()))
          .map((i) => i.str.trim())
          .join(" ");

        const [, day, month] = ANCHOR.exec(anchor.str.trim())!;
        const installment = installmentText
          ? {
              current: Number(INSTALLMENT.exec(installmentText)![1]),
              total: Number(INSTALLMENT.exec(installmentText)![2]),
            }
          : null;
        lines.push({
          date: purchaseDate(Number(day), MONTHS[month], closingDate, installment?.current ?? 1),
          description,
          city,
          amount: parseBrlAmount(value.str),
          installment,
          // As tarifas vêm no bloco "Movimentações da conta", antes do portador,
          // e são do banco: IOF, proteção, anuidade.
          fee: /^(IOF|PROTE[CÇ][AÃ]O|ANUIDADE|TARIFA|ENCARGO|JUROS|MULTA)/i.test(description),
        });
      });
    });
  }

  return { cardName, closingDate, dueDate, total, lines };
}

/**
 * O ano da data, que a fatura não mostra. À vista, a compra é do ciclo que
 * fechou: o ano do fechamento, ou o anterior se o mês passa dele. Na parcela
 * k, a compra original foi uns k-1 meses antes do fechamento.
 */
function purchaseDate(day: number, month: number, closing: Date | null, current: number): Date {
  const closingYear = closing?.getUTCFullYear() ?? new Date().getFullYear();
  const closingMonth = closing ? closing.getUTCFullYear() * 12 + closing.getUTCMonth() : null;
  const options = [0, 1, 2, 3].map((back) => new Date(Date.UTC(closingYear - back, month, day)));
  if (closingMonth === null) return options[0];
  const monthsBefore = (d: Date) => closingMonth - (d.getUTCFullYear() * 12 + d.getUTCMonth());
  return (
    options
      .filter((d) => monthsBefore(d) >= 0)
      .sort(
        (a, b) =>
          Math.abs(monthsBefore(a) - (current - 1)) - Math.abs(monthsBefore(b) - (current - 1)),
      )[0] ?? options[0]
  );
}
