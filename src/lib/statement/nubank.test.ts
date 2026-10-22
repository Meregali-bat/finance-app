import { describe, expect, it } from "vitest";
import { parseBrlAmount, parseNubankStatement, type PdfTextItem } from "./nubank";

// Duas páginas sintéticas no layout do extrato: cabeçalho no topo, rodapé
// embaixo, colunas de data (58), tipo (120), detalhes (262) e valor (≥500).
const header = (top: number): PdfTextItem[] => [
  { str: "Fulana de Tal", x: 431, y: top },
  { str: "CPF", x: 359, y: top - 13 },
  { str: "01 DE OUTUBRO DE 2026", x: 57, y: top - 76 },
  { str: "a", x: 171, y: top - 76 },
  { str: "19 DE OUTUBRO DE 2026", x: 178, y: top - 76 },
];
const footer: PdfTextItem[] = [
  { str: "Tem alguma dúvida? Mande uma mensagem…", x: 57, y: 118 },
  { str: "1 de 2", x: 517, y: 61 },
];

const page1: PdfTextItem[] = [
  ...header(775),
  { str: "Saldo inicial", x: 336, y: 670 },
  { str: "0,00", x: 514, y: 670 },
  { str: "01 OUT 2026", x: 58, y: 539 },
  { str: "Total de entradas", x: 120, y: 539 },
  { str: "+ 180,00", x: 499, y: 539 },
  // O valor vem antes dos detalhes na ordem do PDF.
  { str: "180,00", x: 506, y: 518 },
  { str: "Transferência recebida pelo Pix", x: 120, y: 518 },
  { str: "MARIA SOUZA - •••.347.500-•• -", x: 262, y: 518 },
  { str: "BCO BRADESCO S.A. (0237)", x: 262, y: 498 },
  { str: "Total de saídas", x: 120, y: 444 },
  { str: "- 1.270,00", x: 505, y: 444 },
  { str: "Transferência enviada pelo Pix", x: 120, y: 423 },
  { str: "POSTO RODA MAIS 6 LTDA - 54.312.342/0001-76 -", x: 262, y: 423 },
  { str: "1.250,00", x: 505, y: 423 },
  ...footer,
];
const page2: PdfTextItem[] = [
  ...header(781),
  // Continuação dos detalhes da última linha da página anterior.
  { str: "QUERO-QUERO VERDECARD IP S.A.", x: 262, y: 674 },
  { str: "Compra no débito via NuPay", x: 120, y: 633 },
  { str: "EBW*Spotify", x: 262, y: 633 },
  { str: "20,00", x: 511, y: 633 },
  { str: "02 OUT 2026", x: 58, y: 588 },
  { str: "Total de saídas", x: 120, y: 588 },
  { str: "- 2.000,00", x: 504, y: 588 },
  { str: "Aplicação RDB", x: 120, y: 567 },
  { str: "2.000,00", x: 504, y: 567 },
  // A conta PJ fecha cada dia com o saldo, na coluna do tipo: não é movimento.
  { str: "Saldo do dia", x: 120, y: 533 },
  { str: "627,13", x: 508, y: 533 },
  ...footer,
];

describe("parseNubankStatement", () => {
  const parsed = parseNubankStatement([page1, page2]);

  it("lê o titular e o período do cabeçalho", () => {
    expect(parsed.holder).toBe("Fulana de Tal");
    expect(parsed.period?.start.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(parsed.period?.end.toISOString()).toBe("2026-10-19T00:00:00.000Z");
  });

  it("lê cada linha com dia, sentido, valor, tipo e detalhes", () => {
    expect(
      parsed.lines.map((l) => [l.date.toISOString().slice(0, 10), l.direction, l.amount, l.type]),
    ).toEqual([
      ["2026-10-01", "in", 180, "Transferência recebida pelo Pix"],
      ["2026-10-01", "out", 1250, "Transferência enviada pelo Pix"],
      ["2026-10-01", "out", 20, "Compra no débito via NuPay"],
      ["2026-10-02", "out", 2000, "Aplicação RDB"],
    ]);
  });

  it("junta os detalhes em várias linhas, inclusive vindos da página seguinte", () => {
    expect(parsed.lines[0].detail).toBe("MARIA SOUZA - •••.347.500-•• - BCO BRADESCO S.A. (0237)");
    expect(parsed.lines[1].detail).toBe(
      "POSTO RODA MAIS 6 LTDA - 54.312.342/0001-76 - QUERO-QUERO VERDECARD IP S.A.",
    );
    expect(parsed.lines[3].detail).toBe("");
  });

  it("não lê o saldo do dia como movimento", () => {
    expect(parsed.lines.some((l) => /saldo/i.test(l.type))).toBe(false);
    expect(parsed.lines.some((l) => l.amount === 627.13)).toBe(false);
  });

  it("ignora o resumo do topo e o rodapé", () => {
    expect(parsed.lines).toHaveLength(4);
  });
});

describe("parseBrlAmount", () => {
  it.each([
    ["1.234,56", 1234.56],
    ["+ 180,00", 180],
    ["- 0,09", 0.09],
  ])("%s → %s", (text, value) => {
    expect(parseBrlAmount(text)).toBe(value);
  });
});
