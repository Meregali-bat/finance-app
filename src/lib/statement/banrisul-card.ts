import { groupRows, parseBrlAmount, type PdfTextItem } from "@/lib/statement/nubank";
import type { CardBillLine, CardBillStatement } from "@/lib/statement/sicoob-card";

/**
 * O "Extrato de Cartão de Crédito" do Banrisul em PDF — o da fatura em
 * aberto, que o app do banco gera a qualquer momento. Uma linha por
 * lançamento: a data completa ("06/10/2026") à esquerda, a descrição com a
 * cidade e o país colados ("KRUPP COMBUSTIVEIS ROLANTE BRA") e o valor
 * ("R$ 50,00") à direita, em blocos por final de cartão ("Lançamentos de
 * 0111 - FULANA"). O pagamento da fatura anterior vem negativo e fica de fora.
 */

const DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const MONEY = /^R\$\s?(-?)[\d.]+,\d{2}$/;
/** "PARC 02/05" ou só "02/05" no fim da descrição. */
const INSTALLMENT = /\s+(?:PARC(?:ELA)?\.?\s*)?(\d{1,2})\/(\d{1,2})$/i;

export function isBanrisulCardBill(pages: PdfTextItem[][]): boolean {
  const text = pages.flat().map((i) => i.str);
  return (
    text.some((s) => /Extrato de Cart[aã]o de Cr[eé]dito/i.test(s)) &&
    text.some((s) => /Banco do Estado do Rio Grande do Sul/i.test(s))
  );
}

const utcDate = (day: string, month: string, year: string) =>
  new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

export function parseBanrisulCardBill(pages: PdfTextItem[][]): CardBillStatement {
  const rows = pages.flatMap((page) =>
    groupRows(page.filter((i) => i.str.trim() !== "")).map((row) => row.map((i) => i.str.trim())),
  );
  const all = rows.map((r) => r.join(" ")).join("\n");

  const due = /vencimento:\s*(\d{2})\/(\d{2})\/(\d{4})/i.exec(all);
  const totalMatch = /Faturas em aberto\s+R\$\s?([\d.]+,\d{2})/i.exec(all);

  const lines: CardBillLine[] = [];
  for (const row of rows) {
    const date = DATE.exec(row[0] ?? "");
    const value = row.at(-1) ?? "";
    const money = MONEY.exec(value);
    if (!date || !money || row.length < 3) continue;
    // Negativo: o pagamento da fatura anterior, não compra.
    if (money[1] === "-") continue;
    let description = row
      .slice(1, -1)
      .join(" ")
      .replace(/\s+BRA$/, "")
      .replace(/\s+/g, " ")
      .trim();
    const parcel = INSTALLMENT.exec(description);
    if (parcel) description = description.slice(0, parcel.index).trim();
    lines.push({
      date: utcDate(date[1], date[2], date[3]),
      description,
      // A cidade vem colada na descrição, sem separador que dê para confiar.
      city: "",
      amount: parseBrlAmount(value),
      installment: parcel ? { current: Number(parcel[1]), total: Number(parcel[2]) } : null,
      fee: /^(IOF|ANUIDADE|TARIFA|ENCARGO|JUROS|MULTA|SEGURO)/i.test(description),
    });
  }

  return {
    cardName: "Banrisul",
    closingDate: null,
    dueDate: due ? utcDate(due[1], due[2], due[3]) : null,
    total: totalMatch ? parseBrlAmount(totalMatch[1]) : null,
    lines,
  };
}
