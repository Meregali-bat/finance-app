import { describe, expect, it } from "vitest";
import {
  businessDaysBetween,
  iofRate,
  irRate,
  isBusinessDay,
  remainingLots,
  simulateLotsYield,
  simulateYield,
} from "./jar-yield";

const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

describe("dias úteis", () => {
  it("pula fim de semana e feriado nacional", () => {
    expect(isBusinessDay(day(2026, 10, 24))).toBe(false); // sábado
    expect(isBusinessDay(day(2026, 11, 2))).toBe(false); // Finados
    expect(isBusinessDay(day(2026, 11, 20))).toBe(false); // Consciência Negra
    expect(isBusinessDay(day(2026, 10, 22))).toBe(true);
  });

  it("acha os feriados que andam com a Páscoa", () => {
    // Páscoa de 2027: 28/03. Carnaval 08 e 09/02, Sexta-feira Santa 26/03,
    // Corpus Christi 27/05.
    for (const d of [day(2027, 2, 8), day(2027, 2, 9), day(2027, 3, 26), day(2027, 5, 27)]) {
      expect(isBusinessDay(d)).toBe(false);
    }
  });

  it("conta o dia da aplicação e não o do resgate", () => {
    // Qui 22/10 a qui 29/10: 22, 23, 26, 27, 28.
    expect(businessDaysBetween(day(2026, 10, 22), day(2026, 10, 29))).toBe(5);
    // Uma semana com Finados no meio: 29, 30 e 03 (02 é feriado).
    expect(businessDaysBetween(day(2026, 10, 29), day(2026, 11, 4))).toBe(3);
  });
});

describe("impostos", () => {
  it("IOF regressivo até o 30º dia", () => {
    expect(iofRate(1)).toBe(0.96);
    expect(iofRate(7)).toBe(0.76);
    expect(iofRate(29)).toBe(0.03);
    expect(iofRate(30)).toBe(0);
  });

  it("IR pela tabela regressiva", () => {
    expect(irRate(10)).toBe(0.225);
    expect(irRate(181)).toBe(0.2);
    expect(irRate(400)).toBe(0.175);
    expect(irRate(800)).toBe(0.15);
  });
});

describe("simulateYield", () => {
  it("numa semana, o IOF leva a maior parte do rendimento", () => {
    // R$ 10.000 a 100% de um CDI de 14,9% ao ano, por 7 dias (5 úteis).
    const r = simulateYield({
      amount: 10000,
      cdiAnnualPercent: 14.9,
      cdiPercent: 100,
      from: day(2026, 10, 22),
      to: day(2026, 10, 29),
    });
    expect(r.businessDays).toBe(5);
    expect(r.calendarDays).toBe(7);
    // Diária: 1,149^(1/252) − 1 ≈ 0,0551%; cinco dias ≈ R$ 27,59.
    expect(r.gross).toBeCloseTo(27.59, 1);
    expect(r.iof).toBeCloseTo(r.gross * 0.76, 1);
    expect(r.ir).toBeCloseTo((r.gross - r.iof) * 0.225, 1);
    expect(r.net).toBeCloseTo(r.gross - r.iof - r.ir, 2);
    expect(r.total).toBeCloseTo(10000 + r.net, 2);
  });

  it("depois de 30 dias não há IOF", () => {
    const r = simulateYield({
      amount: 1000,
      cdiAnnualPercent: 12,
      cdiPercent: 100,
      from: day(2026, 1, 5),
      to: day(2026, 2, 5),
    });
    expect(r.iof).toBe(0);
    expect(r.net).toBeCloseTo(r.gross * 0.775, 2);
  });

  it("110% do CDI rende mais que 100%", () => {
    const base = {
      amount: 5000,
      cdiAnnualPercent: 14.9,
      from: day(2026, 1, 5),
      to: day(2026, 7, 5),
    };
    expect(simulateYield({ ...base, cdiPercent: 110 }).gross).toBeGreaterThan(
      simulateYield({ ...base, cdiPercent: 100 }).gross,
    );
  });

  it("resgate no mesmo dia não rende nada", () => {
    const r = simulateYield({
      amount: 1000,
      cdiAnnualPercent: 14.9,
      cdiPercent: 100,
      from: day(2026, 10, 22),
      to: day(2026, 10, 22),
    });
    expect(r).toMatchObject({ gross: 0, net: 0, total: 1000 });
  });
});

describe("entradas em datas diferentes", () => {
  it("o resgate sai primeiro do que entrou primeiro", () => {
    const lots = remainingLots([
      { date: day(2026, 8, 1), amount: 1000 },
      { date: day(2026, 10, 6), amount: 500 },
      { date: day(2026, 9, 10), amount: -300 },
    ]);
    expect(lots).toEqual([
      { from: day(2026, 8, 1), amount: 700 },
      { from: day(2026, 10, 6), amount: 500 },
    ]);
  });

  it("um resgate maior que a entrada mais antiga avança para a seguinte", () => {
    const lots = remainingLots([
      { date: day(2026, 8, 1), amount: 200 },
      { date: day(2026, 8, 15), amount: 800 },
      { date: day(2026, 9, 1), amount: -500 },
    ]);
    expect(lots).toEqual([{ from: day(2026, 8, 15), amount: 500 }]);
  });

  it("cada entrada paga o IOF da própria data: a antiga não paga, a nova sim", () => {
    const r = simulateLotsYield({
      lots: [
        { from: day(2026, 8, 3), amount: 1000 },
        { from: day(2026, 10, 29), amount: 1000 },
      ],
      cdiAnnualPercent: 14.9,
      cdiPercent: 100,
      to: day(2026, 11, 5),
    });
    expect(r.lots[0].iof).toBe(0);
    expect(r.lots[1].iof).toBeGreaterThan(0);
    expect(r.principal).toBe(2000);
    expect(r.total).toBeCloseTo(2000 + r.net, 2);
    expect(r.net).toBeCloseTo(r.lots[0].net + r.lots[1].net, 2);
  });
});
