import { describe, expect, it } from "vitest";
import type { PdfTextItem } from "./nubank";
import { isSicoobStatement, parseSicoobStatement } from "./sicoob";
import { classifyLine, describeLine } from "./reconcile";

// Uma página no layout do Sicoob: data em x=98, histórico e detalhes em
// x=140, valor terminando em C/D à direita. Uma linha a cada 14pt.
let y = 800;
const row = (...cells: [number, string][]): PdfTextItem[] => {
  y -= 14;
  return cells.map(([x, str]) => ({ x, y, str }));
};
const move = (day: string, type: string, value: string, ...details: string[]) => [
  ...row([98, day], [140, type], [455, value]),
  ...details.flatMap((d) => row([140, d])),
];

const page1: PdfTextItem[] = [
  ...row([276, "SICOOB"]),
  ...row([98, "21/10/2026"], [222, "EXTRATO CONTA CORRENTE"]),
  ...row([98, "CONTA:"], [143, "526.916-4 / FULANA DE TAL"]),
  ...row([98, "PERÍODO:"], [156, "01/10/2026 - 21/10/2026"]),
  ...row([98, "DATA"], [140, "HISTÓRICO"], [460, "VALOR"]),
  ...move("20/10", "SALDO DO DIA", "2.289,26C"),
  ...move(
    "20/10",
    "PIX REC.OUTRA IF MT",
    "2.511,84C",
    "Recebimento Pix",
    "Fulana de Tal",
    "***.306.840-**",
    "DOC.: Pix",
  ),
  ...move(
    "20/10",
    "DÉB.PGTO.BOLETO INT",
    "786,71D",
    "Pagamento de cartão de crédito",
    "DOC.: 98023330",
  ),
  ...move(
    "20/10",
    "TRANSF. PIX SICOOB",
    "12,90D",
    "FAV.: JOAO DA SILVA",
    "Transferência Pix",
    "FULANA DE TAL",
    "DOC.: 98001294",
  ),
  ...move("13/10", "EST.COMP VISA ELECT", "15,00C", "BIS CALCADOS RIO REAL BR", "DOC.: 007702"),
  ...move("13/10", "COMP VISA ELECTRO", "15,00D", "BIS CALCADOS RIO REAL BR", "DOC.: 007702"),
  ...move("07/10", "COMP VISA ELECTRO", "49,90D", "RENNER TAQUARA BR"),
];
y = 800;
const page2: PdfTextItem[] = [
  // Detalhe que continua na página seguinte.
  ...row([140, "DOC.: 500130"]),
  ...move("07/10", "DÉB. CONV. SEGUROS", "21,13D", "DOC.: SICOOB SEG"),
  ...move("06/10", "EST.DÉB. CONV. SEGU", "21,13C", "DOC.: SICOOB SEG"),
  ...move("06/10", "DÉB. CONV. SEGUROS", "21,13D", "DOC.: SICOOB SEG"),
  ...move(
    "06/10",
    "PIX EMIT.OUTRA IF",
    "22,97D",
    "Pagamento Pix",
    "17.895.646 0001-87",
    "DOC.: Pix",
  ),
  ...move(
    "05/10",
    "PIX.EMIT.OUT IF-MSM",
    "2.000,00D",
    "Pagamento Pix",
    "***.306.840-**",
    "DOC.: Pix",
  ),
  ...row([98, "RESUMO"]),
  ...row([98, "(+) SALDO EM CONTA:"], [446, "2.289,26C"]),
];

describe("parseSicoobStatement", () => {
  const parsed = parseSicoobStatement([page1, page2]);

  it("reconhece o extrato do Sicoob", () => {
    expect(isSicoobStatement([page1, page2])).toBe(true);
    expect(isSicoobStatement([[{ x: 0, y: 0, str: "Nubank" }]])).toBe(false);
  });

  it("lê titular e período", () => {
    expect(parsed.holder).toBe("FULANA DE TAL");
    expect(parsed.period?.end.toISOString()).toBe("2026-10-21T00:00:00.000Z");
  });

  it("pula o saldo do dia e o resumo, e desfaz estornos pelo mesmo DOC", () => {
    expect(
      parsed.lines.map((l) => [l.date.toISOString().slice(5, 10), l.direction, l.amount, l.type]),
    ).toEqual([
      ["10-20", "in", 2511.84, "PIX REC.OUTRA IF MT"],
      ["10-20", "out", 786.71, "DÉB.PGTO.BOLETO INT"],
      ["10-20", "out", 12.9, "TRANSF. PIX SICOOB"],
      ["10-07", "out", 49.9, "COMP VISA ELECTRO"],
      // Estornado no dia 06: sobra a cobrança do dia 07, não a do 06.
      ["10-07", "out", 21.13, "DÉB. CONV. SEGUROS"],
      ["10-06", "out", 22.97, "PIX EMIT.OUTRA IF"],
      ["10-05", "out", 2000, "PIX.EMIT.OUT IF-MSM"],
    ]);
  });

  it("diz quem está do outro lado", () => {
    expect(parsed.lines.map((l) => l.counterparty)).toEqual([
      "Fulana de Tal",
      "",
      "JOAO DA SILVA",
      "RENNER TAQUARA",
      "",
      "17.895.646/0001-87",
      "FULANA DE TAL",
    ]);
  });

  it("classifica e descreve", () => {
    const [own, bill, pix, debit, insurance, cnpj, same] = parsed.lines;
    expect(classifyLine(own, parsed.holder)).toBe("ownTransfer");
    expect(classifyLine(same, parsed.holder)).toBe("ownTransfer");
    expect(classifyLine(bill, parsed.holder)).toBe("billPayment");
    expect(classifyLine(pix, parsed.holder)).toBe("movement");
    expect(describeLine(pix)).toBe("Pix para Joao da Silva");
    expect(describeLine(debit)).toBe("Renner Taquara");
    expect(describeLine(insurance)).toBe("Seguro");
    expect(describeLine(cnpj)).toBe("Pix para 17.895.646/0001-87");
  });
});
