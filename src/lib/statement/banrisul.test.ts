import { describe, expect, it } from "vitest";
import type { PdfTextItem } from "./nubank";
import { isBanrisulStatement, parseBanrisulStatement } from "./banrisul";
import { isSicoobStatement } from "./sicoob";
import { classifyLine, describeLine } from "./reconcile";

// Uma página no layout do Banrisul: fonte de máquina de escrever, o dia em
// x=36, o histórico em x=65, "NOME:" em x=72, o documento em x=209 e o valor
// à direita. Uma linha a cada 16pt.
let y = 790;
const row = (...cells: [number, string][]): PdfTextItem[] => {
  y -= 16;
  return cells.map(([x, str]) => ({ x, y, str }));
};

const page: PdfTextItem[] = [
  // O nome do banco vem letra por letra, com espaços como pedaços próprios.
  ...row(...[..."BANRIS"].map((c, i): [number, string] => [36 + i * 14, c]), [122, "U L"]),
  ...row([36, "AGENCIA:"], [94, " "], [101, "0100"]),
  ...row([36, "NOME...:"], [94, " "], [101, "FULANA DE TAL"]),
  ...row([36, "--------"], [130, "PARA SIMPLES CONFERENCIA"]),
  ...row([36, "SALDO"], [79, "DEVEDOR..............R$"], [353, "47,29-"]),
  ...row([36, "DIA"], [65, "HISTORICO"], [202, "DOCUMENTO"], [331, "V A L O R"]),
  ...row([36, "----------"], [115, "MOVIMENTOS DA CONTA CORRENTE ----------"]),
  ...row([65, "SALDO"], [108, "ANT EM 29/09/2026"], [346, "386,11-"]),
  ...row([36, "++"], [65, "MOVIMENTOS SET/2026"]),
  ...row([36, "30"], [65, "IOF"], [209, "000000"], [360, "0,25-"]),
  ...row([65, "IOF"], [94, "ADICIONAL"], [209, "000000"], [360, "1,43-"]),
  ...row([65, "SALDO"], [108, "NA DATA"], [346, "387,79-"]),
  ...row([36, "++"], [65, "MOVIMENTOS OUT/2026"]),
  ...row([36, "02"], [65, "PIX"], [209, "117753"], [353, "51,50-"]),
  ...row([72, "NOME:"], [115, "BAR DO ZE LTDA"]),
  ...row([65, "SALDO"], [108, "NA DATA"], [346, "439,29-"]),
  ...row([36, "05"], [50, " "], [65, "PIX"], [94, "RECEBIDO"], [209, "CEECA3"], [339, "1.440,00"]),
  ...row([72, "NOME:"], [115, "62.071.278 FULANA DE TAL"]),
  ...row([65, "SALDO"], [108, "NA DATA"], [346, "1.000,71"]),
  ...row([36, "-----"], [79, "EXTRATO EMITIDO AS 22:55 DE 21/10/2026 -----"]),
  ...row([158, "SAC 0800 646 1515"]),
];

describe("extrato do Banrisul", () => {
  const parsed = parseBanrisulStatement([page]);

  it("é reconhecido pelo nome espaçado do banco, e não como Sicoob", () => {
    expect(isBanrisulStatement([page])).toBe(true);
    expect(isSicoobStatement([page])).toBe(false);
  });

  it("lê o titular e o período do cabeçalho", () => {
    expect(parsed.holder).toBe("FULANA DE TAL");
    expect(parsed.period).toEqual({
      start: new Date(Date.UTC(2026, 8, 30)),
      end: new Date(Date.UTC(2026, 9, 21)),
    });
  });

  it("lê os movimentos, com o mês do cabeçalho e o dia repetido de cima", () => {
    expect(
      parsed.lines.map((l) => [l.date.toISOString().slice(0, 10), l.direction, l.amount, l.type]),
    ).toEqual([
      ["2026-09-30", "out", 0.25, "IOF"],
      ["2026-09-30", "out", 1.43, "IOF ADICIONAL"],
      ["2026-10-02", "out", 51.5, "PIX"],
      ["2026-10-05", "in", 1440, "PIX RECEBIDO"],
    ]);
  });

  it("descreve cada linha e reconhece o Pix do próprio MEI", () => {
    const [iof, extra, pix, received] = parsed.lines;
    expect(describeLine(iof)).toBe("IOF");
    expect(describeLine(extra)).toBe("IOF adicional");
    expect(describeLine(pix)).toBe("Pix para Bar do Ze Ltda");
    expect(classifyLine(pix, parsed.holder)).toBe("movement");
    expect(received.counterparty).toBe("FULANA DE TAL");
    expect(classifyLine(received, parsed.holder)).toBe("ownTransfer");
  });
});
