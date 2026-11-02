import { describe, expect, it } from "vitest";
import { paceAcrossCycles, paceSpendByCycle, paceWarning, spendingPace } from "./spending-pace";

const utc = (m: number, d: number) => new Date(Date.UTC(2026, m - 1, d));
// Ciclo de 15/out a 15/nov; hoje é 24/out, o 10º dia. Faltam 22 dias com hoje.
const base = {
  periodStart: new Date(2026, 9, 15),
  daysLeft: 22,
  today: new Date(2026, 9, 24, 20),
  transactions: [],
  cardPurchases: [],
};

describe("spendingPace", () => {
  it("a média do ciclo, separada em conta e em cada cartão", () => {
    const pace = spendingPace({
      ...base,
      transactions: [
        { amount: 300, date: utc(10, 16) },
        { amount: 100, date: utc(10, 24) },
      ],
      cardPurchases: [{ cardId: "nu", amount: 100, date: utc(10, 20) }],
    })!;
    expect(pace).toMatchObject({
      spent: 500,
      elapsedDays: 10,
      perDay: 50,
      accountPerDay: 40,
      cardPerDay: [{ cardId: "nu", perDay: 10 }],
      remainingDays: 21,
    });
  });

  it("compra parcelada entra pela parcela; receita, fechamento e fora do ciclo não", () => {
    const pace = spendingPace({
      ...base,
      transactions: [
        { amount: -5000, date: utc(10, 15) },
        { amount: 80, date: utc(10, 15), fromPeriodClose: true },
        { amount: 70, date: utc(10, 14) },
        { amount: 90, date: utc(10, 25) },
        { amount: 100, date: utc(10, 18) },
      ],
      cardPurchases: [{ cardId: "nu", amount: 1200, date: utc(10, 20), installments: 12 }],
    })!;
    expect(pace.spent).toBe(200);
  });

  it("nos primeiros dias, ou sem gasto, não projeta", () => {
    expect(
      spendingPace({
        ...base,
        today: new Date(2026, 9, 16),
        transactions: [{ amount: 50, date: utc(10, 15) }],
      }),
    ).toBeNull();
    expect(spendingPace(base)).toBeNull();
  });
});

describe("paceSpendByCycle", () => {
  // Ciclos de salário dia 15: 15/out–15/nov e 15/nov–15/dez.
  const periods = [
    { periodStart: new Date(2026, 9, 15), periodEnd: new Date(2026, 10, 15) },
    { periodStart: new Date(2026, 10, 15), periodEnd: new Date(2026, 11, 15) },
  ];
  // Fecha dia 1, vence dia 10: o que se compra de 2/out a 1/nov vence 10/nov.
  const cards = [{ id: "nu", closingDay: 1, dueDay: 10 }];

  it("a conta pesa no dia; o cartão, no ciclo em que vence a fatura", () => {
    // De 25/out a 14/dez: 21 dias no ciclo atual, 30 no próximo.
    const spend = paceSpendByCycle(
      { accountPerDay: 10, cardPerDay: [{ cardId: "nu", perDay: 20 }] },
      periods,
      cards,
      new Date(2026, 9, 25),
    );
    // Cartão: 25/out a 1/nov (8 dias) vence 10/nov, no atual; 2/nov a 1/dez
    // (30 dias) vence 10/dez, no próximo; o resto vence em jan, fora.
    expect(spend).toEqual([21 * 10 + 8 * 20, 30 * 10 + 30 * 20]);
  });

  it("cartão apagado conta como a conta", () => {
    expect(
      paceSpendByCycle(
        { accountPerDay: 0, cardPerDay: [{ cardId: "velho", perDay: 5 }] },
        periods,
        cards,
        new Date(2026, 9, 25),
      ),
    ).toEqual([105, 150]);
  });
});

describe("paceAcrossCycles", () => {
  const cycle = (freeToSpend: number, endBalance = 0) => ({ freeToSpend, endBalance });

  it("a sobra do ciclo atual entra no seguinte, e o ritmo tira o que é de cada um", () => {
    // Sobram 1.500 − 1.050 = 450 agora; o próximo tem 2.787 e gasta 1.500.
    expect(paceAcrossCycles([1050, 1500], [cycle(1500), cycle(2787)])).toEqual([450, 1737]);
  });

  it("a falta do ritmo passa adiante, sem contar de novo a que a previsão já tinha", () => {
    // O atual já fechava em −1.000 pela previsão; o ritmo leva a −1.600. O
    // próximo já herda os −1.000 no livre dele: só os −600 a mais passam.
    expect(paceAcrossCycles([600, 1500], [cycle(0, -1000), cycle(2000)])).toEqual([-1600, -100]);
  });
});

describe("paceWarning", () => {
  const periods = [
    { periodStart: new Date(2026, 9, 15), periodEnd: new Date(2026, 10, 15), freeToSpend: 1000, endBalance: 0 },
    { periodStart: new Date(2026, 10, 15), periodEnd: new Date(2026, 11, 15), freeToSpend: 3000, endBalance: 0 },
  ];
  const pace = { perDay: 100, accountPerDay: 100, cardPerDay: [] };
  const tomorrow = new Date(2026, 9, 25);

  it("no ritmo, o primeiro ciclo que fica no vermelho: quanto falta, quando e o alvo", () => {
    // 21 dias a R$ 100 no atual: tira 2.100 de 1.000, faltam 1.100 em 14/11.
    const w = paceWarning(pace, periods, [], tomorrow)!;
    expect(w.offset).toBe(0);
    expect(w.left).toBe(-1100);
    expect(w.lastDay).toEqual(new Date(2026, 10, 14));
    // Fecha gastando 1.000 em 21 dias: R$ 47,61 (para baixo, no centavo).
    expect(w.perDayTarget).toBe(47.61);
  });

  it("dentro do ritmo, nada", () => {
    expect(paceWarning({ ...pace, perDay: 10, accountPerDay: 10 }, periods, [], tomorrow)).toBeNull();
  });

  it("o alvo vale para os dois ciclos: o cartão de agora pesa na fatura do próximo", () => {
    // R$ 10 na conta e R$ 90 no cartão por dia; a fatura fecha dia 1 e vence
    // dia 10, então quase todo o cartão cai no próximo ciclo. Só pelo ciclo
    // atual (que mal passa do livre), o alvo seria R$ 96,77; com o próximo,
    // que recebe as faturas, é R$ 61,06.
    const cardPace = { perDay: 100, accountPerDay: 10, cardPerDay: [{ cardId: "nu", perDay: 90 }] };
    const tight = [{ ...periods[0], freeToSpend: 900 }, { ...periods[1], freeToSpend: 1500 }];
    const w = paceWarning(cardPace, tight, [{ id: "nu", closingDay: 1, dueDay: 10 }], tomorrow)!;
    expect(w.offset).toBe(0);
    expect(w.perDayTarget).toBe(61.06);
  });

  it("o alvo nunca passa do número do dia", () => {
    const w = paceWarning(pace, periods, [], tomorrow, 20)!;
    expect(w.perDayTarget).toBe(20);
  });

  it("se nem sem gastar fecha, sem alvo por dia", () => {
    const short = [{ ...periods[0], freeToSpend: 0, endBalance: -200 }, periods[1]];
    const w = paceWarning(pace, short, [], tomorrow)!;
    expect(w.perDayTarget).toBeNull();
  });
});
