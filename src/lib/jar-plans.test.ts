import { describe, expect, it } from "vitest";
import { jarReturns } from "./jar-plans";

const day = (m: number, d: number) => new Date(Date.UTC(2026, m - 1, d));
const at = (m: number, d: number) => new Date(2026, m - 1, d, 12);
const today = new Date(2026, 9, 22, 10);

describe("jarReturns", () => {
  it("o depósito com data de resgate volta naquele dia", () => {
    expect(
      jarReturns(
        [{ jarId: "j", amount: 1000, date: at(10, 22), plannedWithdrawalAt: day(11, 5) }],
        today,
      ),
    ).toMatchObject([{ jarId: "j", amount: 1000, date: day(11, 5), overdue: false }]);
  });

  it("depósito sem data é guardado, não volta", () => {
    expect(jarReturns([{ jarId: "j", amount: 1000, date: at(10, 22) }], today)).toEqual([]);
  });

  it("o resgate de verdade abate o previsto", () => {
    const returns = jarReturns(
      [
        { jarId: "j", amount: 1000, date: at(10, 1), plannedWithdrawalAt: day(10, 20) },
        { jarId: "j", amount: -400, date: at(10, 20) },
      ],
      today,
    );
    // Sobraram 600 do previsto para 20/10, e o dia já passou.
    expect(returns).toMatchObject([{ jarId: "j", amount: 600, date: day(10, 20), overdue: true }]);
  });

  it("um resgate abate primeiro o previsto mais próximo", () => {
    const returns = jarReturns(
      [
        { jarId: "j", amount: 500, date: at(10, 1), plannedWithdrawalAt: day(12, 5) },
        { jarId: "j", amount: 500, date: at(10, 2), plannedWithdrawalAt: day(11, 5) },
        { jarId: "j", amount: -500, date: at(10, 21) },
      ],
      today,
    );
    expect(returns.map((r) => [r.date, r.amount])).toEqual([[day(12, 5), 500]]);
  });

  it("um resgate anterior ao depósito não abate o previsto dele", () => {
    const returns = jarReturns(
      [
        { jarId: "j", amount: -300, date: at(10, 1) },
        { jarId: "j", amount: 1000, date: at(10, 5), plannedWithdrawalAt: day(11, 5) },
      ],
      today,
    );
    expect(returns[0].amount).toBe(1000);
  });

  it("cada caixinha abate só os próprios previstos", () => {
    const returns = jarReturns(
      [
        { jarId: "a", amount: 1000, date: at(10, 1), plannedWithdrawalAt: day(11, 5) },
        { jarId: "b", amount: -1000, date: at(10, 10) },
      ],
      today,
    );
    expect(returns).toHaveLength(1);
    expect(returns[0]).toMatchObject({ jarId: "a", amount: 1000 });
  });
});

describe("jarReturns — resgate agendado", () => {
  it("dinheiro que já estava na caixinha volta no dia agendado", () => {
    const returns = jarReturns([{ jarId: "j", amount: 3000, date: at(8, 1) }], today, [
      { id: "s", jarId: "j", amount: 1450, date: day(11, 8), createdAt: at(10, 22) },
    ]);
    expect(returns).toEqual([
      {
        source: { kind: "schedule", id: "s" },
        jarId: "j",
        amount: 1450,
        date: day(11, 8),
        overdue: false,
      },
    ]);
  });

  it("um resgate de antes do agendamento não o abate; um de depois, sim", () => {
    const schedule = {
      id: "s",
      jarId: "j",
      amount: 1000,
      date: day(11, 8),
      createdAt: at(10, 22),
    };
    expect(
      jarReturns([{ jarId: "j", amount: -500, date: at(10, 10) }], today, [schedule])[0].amount,
    ).toBe(1000);
    expect(
      jarReturns([{ jarId: "j", amount: -400, date: new Date(2026, 9, 22, 15) }], today, [
        schedule,
      ])[0].amount,
    ).toBe(600);
  });
});
