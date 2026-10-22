import { describe, expect, it } from "vitest";
import type { StatementLine } from "./nubank";
import {
  classifyLine,
  counterparty,
  describeLine,
  fingerprints,
  localDay,
  reconcile,
  utcDay,
  type AppMovement,
} from "./reconcile";

const line = (overrides: Partial<StatementLine>): StatementLine => ({
  date: new Date("2026-10-06T00:00:00.000Z"),
  direction: "out",
  amount: 50,
  type: "Transferência enviada pelo Pix",
  detail: "POSTO RODA MAIS 6 LTDA - 54.312.342/0001-76 - QUERO-QUERO",
  ...overrides,
});
const HOLDER = "Fulana de Tal";

describe("classifyLine", () => {
  it("transferência com o titular dos dois lados é entre contas próprias", () => {
    expect(classifyLine(line({ detail: "FULANA DE TAL - •••.306.840-•• - SICOOB" }), HOLDER)).toBe(
      "ownTransfer",
    );
  });
  it("na conta do MEI, o CNPJ na frente do titular não esconde que é a mesma pessoa", () => {
    expect(
      classifyLine(
        line({ detail: "Fulana de Tal - •••.176.710-•• - Banco do Estado" }),
        "62.071.278 FULANA DE TAL",
      ),
    ).toBe("ownTransfer");
  });
  it("RDB é investimento, fatura é pagamento de fatura, o resto é movimento", () => {
    expect(classifyLine(line({ type: "Aplicação RDB", detail: "" }), HOLDER)).toBe("investment");
    expect(classifyLine(line({ type: "Resgate RDB", detail: "" }), HOLDER)).toBe("investment");
    expect(classifyLine(line({ type: "Pagamento de fatura", detail: "" }), HOLDER)).toBe(
      "billPayment",
    );
    expect(classifyLine(line({}), HOLDER)).toBe("movement");
  });
});

describe("describeLine", () => {
  it("Pix vira 'Pix para/de' com o nome arrumado", () => {
    expect(describeLine(line({}))).toBe("Pix para Posto Roda Mais 6 Ltda");
    expect(
      describeLine(
        line({
          direction: "in",
          type: "Transferência recebida pelo Pix",
          detail: "24.324.237 MARGARETE DA SILVA - 24.324.237/0001-96 - PAGSEGURO",
        }),
      ),
    ).toBe("Pix de Margarete da Silva");
  });
  it("débito vira o nome da loja; boleto, 'Boleto' e a empresa", () => {
    expect(describeLine(line({ type: "Compra no débito via NuPay", detail: "EBW*Spotify" }))).toBe(
      "Spotify",
    );
    expect(
      describeLine(line({ type: "Pagamento de boleto efetuado", detail: "CLICKCONNECT SOLUCOES" })),
    ).toBe("Boleto Clickconnect Solucoes");
  });
  it("sem detalhes, o tipo como está", () => {
    expect(describeLine(line({ type: "Resgate de empréstimo", detail: "" }))).toBe(
      "Resgate de empréstimo",
    );
  });
});

describe("counterparty", () => {
  it("tira o CNPJ da frente e para no primeiro ' - '", () => {
    expect(counterparty("24.568.563 NADINE ZAMBELLI - 24.568.563/0001-49 - NU")).toBe(
      "NADINE ZAMBELLI",
    );
  });
});

describe("fingerprints", () => {
  it("linhas idênticas no mesmo dia se separam pela ordem", () => {
    const [a, b] = fingerprints([line({}), line({})]);
    expect(a).not.toBe(b);
    expect(fingerprints([line({})])[0]).toBe(a);
  });
});

describe("reconcile", () => {
  const day = (iso: string) => utcDay(new Date(`${iso}T00:00:00.000Z`));

  it("confere pelo mesmo valor com até 2 dias, cada registro uma vez só", () => {
    const app: AppMovement[] = [{ day: day("2026-10-07"), amount: 50, kind: "transaction" }];
    const result = reconcile([line({}), line({})], HOLDER, app);
    expect(result.map((r) => r.matched)).toEqual([true, false]);
  });

  it("não confere com 3 dias de diferença, exceto renda", () => {
    expect(
      reconcile([line({})], HOLDER, [
        { day: day("2026-10-09"), amount: 50, kind: "transaction" },
      ])[0].matched,
    ).toBe(false);
    const salary = line({ direction: "in", amount: 6000, type: "Transferência recebida pelo Pix" });
    expect(
      reconcile([salary], HOLDER, [{ day: day("2026-10-09"), amount: -6000, kind: "income" }])[0]
        .matched,
    ).toBe(true);
  });

  it("entrada confere com valor negativo do app, nunca com uma saída", () => {
    const received = line({ direction: "in" });
    expect(
      reconcile([received], HOLDER, [
        { day: day("2026-10-06"), amount: 50, kind: "transaction" },
      ])[0].matched,
    ).toBe(false);
  });

  it("pagamento de fatura só confere com pagamento de fatura", () => {
    const bill = line({ type: "Pagamento de fatura", detail: "", amount: 1032.92 });
    expect(
      reconcile([bill], HOLDER, [
        { day: day("2026-10-06"), amount: 1032.92, kind: "transaction" },
      ])[0].matched,
    ).toBe(false);
    expect(
      reconcile([bill], HOLDER, [
        { day: day("2026-10-06"), amount: 1032.92, kind: "billPayment" },
      ])[0].matched,
    ).toBe(true);
  });

  it("transferência própria não confere nada, mas aponta o lançamento que a registrou como gasto", () => {
    const own = line({ detail: "FULANA DE TAL - SICOOB" });
    const result = reconcile([own], HOLDER, [
      { day: day("2026-10-05"), amount: 50, kind: "fixedPayment" },
      { day: day("2026-10-07"), amount: 50, kind: "transaction" },
    ]);
    expect(result[0]).toMatchObject({ kind: "ownTransfer", matched: false, wrongRecord: 1 });
  });

  it("investimento não procura par, e transferência sem lançamento não aponta nada", () => {
    const rdb = line({ type: "Aplicação RDB", detail: "" });
    const own = line({ detail: "FULANA DE TAL - SICOOB", amount: 70 });
    const result = reconcile([rdb, own], HOLDER, [
      { day: day("2026-10-06"), amount: 50, kind: "transaction" },
    ]);
    expect(result.map((r) => [r.kind, r.matched, r.wrongRecord])).toEqual([
      ["investment", false, null],
      ["ownTransfer", false, null],
    ]);
  });

  it("localDay usa o dia local de um instante", () => {
    expect(localDay(new Date(2026, 9, 6, 23, 30))).toBe(day("2026-10-06"));
  });
});
