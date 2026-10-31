import { describe, expect, it } from "vitest";
import type { PdfTextItem } from "./nubank";
import { isBanrisulCardBill, parseBanrisulCardBill } from "./banrisul-card";
import { isSicoobCardBill } from "./sicoob-card";
import { isBanrisulStatement } from "./banrisul";

// O extrato do cartão do Banrisul (fatura em aberto), como o app gera: data
// em x=37, descrição em x=124, valor perto de x=510. Valores do PDF real.
let y = 740;
const row = (...cells: [number, string][]): PdfTextItem[] => {
  y -= 17;
  return cells.map(([x, str]) => ({ x, y, str }));
};
const line = (date: string, description: string, value: string) =>
  row([37, date], [124, description], [510, value]);

const page: PdfTextItem[] = [
  ...row([176, "Extrato de Cartão de Crédito"]),
  ...row([260, "Próxima fatura"]),
  ...row([203, "em aberto - vencimento: 15/11/2026"]),
  ...row([228, "cartão 5544.73**.****.0111"]),
  ...row([37, "Lançamentos de 0111- FULANA DE TAL"]),
  ...line("06/10/2026", "PGTO HOME/OFFICE BANKING", "R$ -349,00"),
  ...line("10/10/2026", "IFD*IFOOD CLUB Osasco BRA", "R$ 7,95"),
  ...line("16/10/2026", "BarbatanaCraft TRES COROAS BRA", "R$ 216,80"),
  ...line("26/10/2026", "KRUPP COMBUSTIVEIS ROLANTE BRA", "R$ 50,00"),
  ...line("26/10/2026", "RAINA I HESS BLAUTH TAQUARA BRA", "R$ 46,00"),
  ...line("28/10/2026", "CLAUDIONOR PACHECO ME TAQUARA BRA", "R$ 38,54"),
  ...row([37, "Lançamentos de 2423- FULANA DE TAL"]),
  ...line("05/10/2026", "DL*UberRides Sao Paulo BRA", "R$ 7,94"),
  ...line("09/10/2026", "DL *UberRides Sao Paulo BRA", "R$ 63,93"),
  ...line("10/10/2026", "DL*UberRides Sao Paulo BRA", "R$ 53,95"),
  ...line("15/10/2026", "DL *UberRides Sao Paulo BRA", "R$ 11,99"),
  ...line("17/10/2026", "DL *UberRides Sao Paulo BRA", "R$ 36,23"),
  ...line("18/10/2026", "DL *UberRides Sao Paulo BRA", "R$ 47,99"),
  ...line("20/10/2026", "Google One SAO PAULO BRA", "R$ 49,99"),
  ...line("25/10/2026", "APPLE.COM/BILL SAO PAULO BRA", "R$ 1,50"),
  ...row([37, "Saldos"]),
  ...row([37, "Valor do dólar hoje"], [503, "R$ 5,5838"]),
  ...row([37, "Faturas em aberto"], [503, "R$ 632,81"]),
  ...row([37, "Limite utilizado"], [503, "R$ 858,00"]),
  ...row([217, "Banco do Estado do Rio Grande do Sul S.A."]),
];

describe("fatura do cartão Banrisul", () => {
  it("é reconhecida, e não como extrato de conta nem fatura do Sicoob", () => {
    expect(isBanrisulCardBill([page])).toBe(true);
    expect(isSicoobCardBill([page])).toBe(false);
    expect(isBanrisulStatement([page])).toBe(false);
  });

  it("lê as compras dos dois finais, sem o pagamento, e elas somam o total", () => {
    const bill = parseBanrisulCardBill([page]);
    expect(bill.dueDate).toEqual(new Date(Date.UTC(2026, 10, 15)));
    expect(bill.total).toBe(632.81);
    expect(bill.lines).toHaveLength(13);
    const sum = Math.round(bill.lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
    expect(sum).toBe(bill.total);
    expect(bill.lines[2]).toEqual({
      date: new Date(Date.UTC(2026, 9, 26)),
      description: "KRUPP COMBUSTIVEIS ROLANTE",
      city: "",
      amount: 50,
      installment: null,
      fee: false,
    });
  });

  it("parcela no fim da descrição", () => {
    const bill = parseBanrisulCardBill([
      [
        ...page.slice(0, 5),
        { x: 37, y: 100, str: "12/09/2026" },
        { x: 124, y: 100, str: "MAGAZINE LUIZA PARC 02/05" },
        { x: 510, y: 100, str: "R$ 120,00" },
      ],
    ]);
    expect(bill.lines[0]).toMatchObject({
      description: "MAGAZINE LUIZA",
      installment: { current: 2, total: 5 },
    });
  });
});
