import { describe, expect, it } from "vitest";
import { spendingCalendar } from "./spending-calendar";

const day = (d: number) => new Date(Date.UTC(2026, 9, d));
const october = {
  firstDay: "2026-10-01",
  lastDay: "2026-10-31",
  today: "2026-10-21",
};

describe("spendingCalendar", () => {
  it("monta semanas de segunda a domingo, com vazios fora do período", () => {
    const { weeks } = spendingCalendar({ ...october, entries: [] });
    // 01/10/2026 é uma quinta.
    expect(weeks[0].slice(0, 3)).toEqual([null, null, null]);
    expect(weeks[0][3]?.day).toBe(1);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
    // E 31/10 é um sábado: sobra o domingo vazio no fim.
    expect(weeks.at(-1)![5]?.day).toBe(31);
    expect(weeks.at(-1)![6]).toBeNull();
  });

  it("soma o dia e ordena os lançamentos do maior para o menor", () => {
    const calendar = spendingCalendar({
      ...october,
      entries: [
        { date: day(5), amount: 20, description: "Padaria" },
        {
          date: day(5),
          amount: 80,
          description: "Mercado",
          cardName: "Nubank",
        },
      ],
    });
    const fifth = calendar.weeks.flat().find((d) => d?.day === 5)!;
    expect(fifth.total).toBe(100);
    expect(fifth.entries.map((e) => e.description)).toEqual(["Mercado", "Padaria"]);
    expect(calendar.total).toBe(100);
    expect(calendar.activeDays).toBe(1);
    expect(calendar.peak?.key).toBe("2026-10-05");
  });

  it("deixa de fora receitas e o que cai fora do período", () => {
    const calendar = spendingCalendar({
      ...october,
      entries: [
        { date: day(3), amount: -3000, description: "Salário" },
        {
          date: new Date(Date.UTC(2026, 10, 1)),
          amount: 50,
          description: "Novembro",
        },
      ],
    });
    expect(calendar.total).toBe(0);
    expect(calendar.peak).toBeNull();
  });

  it("gradua em raiz: um dia muito pesado não apaga os pequenos", () => {
    const calendar = spendingCalendar({
      ...october,
      entries: [
        { date: day(2), amount: 1600, description: "Viagem" },
        { date: day(3), amount: 100, description: "Jantar" },
      ],
    });
    const levels = calendar.weeks
      .flat()
      .filter(Boolean)
      .map((d) => [d!.day, d!.level]);
    expect(levels.find(([d]) => d === 2)?.[1]).toBe(4);
    expect(levels.find(([d]) => d === 3)?.[1]).toBe(1);
    expect(levels.find(([d]) => d === 4)?.[1]).toBe(0);
  });

  it("marca os dias que ainda não chegaram", () => {
    const days = spendingCalendar({ ...october, entries: [] })
      .weeks.flat()
      .filter(Boolean);
    expect(days.find((d) => d!.day === 21)!.future).toBe(false);
    expect(days.find((d) => d!.day === 22)!.future).toBe(true);
  });
});
