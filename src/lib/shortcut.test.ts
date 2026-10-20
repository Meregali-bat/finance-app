import { describe, expect, it } from "vitest";
import {
  calendarToday,
  hashShortcutToken,
  matchCard,
  newShortcutToken,
  parseShortcutAmount,
  shortcutDescription,
} from "./shortcut";

describe("parseShortcutAmount", () => {
  it.each([
    [12.5, 12.5],
    [-12.5, 12.5],
    ["R$ 12,50", 12.5],
    ["R$ 1.234,56", 1234.56],
    ["-R$ 12,50", 12.5],
    ["12.50", 12.5],
    ["1,234.56", 1234.56],
    ["1.234", 1234],
    ["R$ 980,00", 980],
    ["7", 7],
  ])("%j → %j", (raw, expected) => {
    expect(parseShortcutAmount(raw)).toBe(expected);
  });

  it.each([[""], ["abc"], [0], ["R$ 0,00"], [null], [undefined], [{}], [Number.NaN]])(
    "%j → nulo",
    (raw) => {
      expect(parseShortcutAmount(raw)).toBeNull();
    },
  );
});

describe("matchCard", () => {
  const cards = [
    { id: "nu", name: "Nubank" },
    { id: "sicoob", name: "Sicoob" },
    { id: "sicoob-black", name: "Sicoob Black" },
  ];

  it("casa o nome da Carteira que contém o do app", () => {
    expect(matchCard("Nubank Ultravioleta", cards)?.id).toBe("nu");
  });

  it("ignora caixa e acento", () => {
    expect(matchCard("NÚBANK", cards)?.id).toBe("nu");
  });

  it("prefere o nome mais específico", () => {
    expect(matchCard("Sicoob Mastercard Black", cards)?.id).toBe("sicoob");
    expect(matchCard("Sicoob Black", cards)?.id).toBe("sicoob-black");
  });

  it("não casa pedaço de palavra", () => {
    expect(matchCard("Nubanking", cards)).toBeNull();
  });

  it("sem cartão reconhecido, nulo", () => {
    expect(matchCard("Itaú Click", cards)).toBeNull();
    expect(matchCard("", cards)).toBeNull();
    expect(matchCard(undefined, cards)).toBeNull();
  });
});

describe("shortcutDescription", () => {
  it("usa a loja, sem espaços sobrando", () => {
    expect(shortcutDescription("  Padaria   Pão Quente ", "Nubank")).toBe("Padaria Pão Quente");
  });

  it("sem loja, diz de onde veio", () => {
    expect(shortcutDescription("", "Nubank")).toBe("Compra no Nubank");
    expect(shortcutDescription(undefined, null)).toBe("Compra por aproximação");
  });
});

describe("chave", () => {
  it("gera chaves diferentes, e o hash não depende de espaço em volta", () => {
    const a = newShortcutToken();
    expect(a).toMatch(/^fin_[A-Za-z0-9_-]{43}$/);
    expect(newShortcutToken()).not.toBe(a);
    expect(hashShortcutToken(` ${a}\n`)).toBe(hashShortcutToken(a));
  });
});

describe("calendarToday", () => {
  it("grava o dia local como meia-noite UTC", () => {
    expect(calendarToday(new Date(2026, 9, 20, 23, 30)).toISOString()).toBe(
      "2026-10-20T00:00:00.000Z",
    );
  });
});
