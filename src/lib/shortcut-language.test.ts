import { describe, expect, it } from "vitest";
import { shortcutLanguage } from "./shortcut-language";

describe("shortcutLanguage", () => {
  it.each([
    ["en-US,en;q=0.9", "en"],
    ["en-BR,pt-BR;q=0.9", "en"],
    ["pt-BR,pt;q=0.9,en;q=0.8", "pt"],
    ["pt-br", "pt"],
    ["fr-FR,en;q=0.5", "en"],
    ["en;q=0.4,pt-BR;q=0.9", "pt"],
    ["de-DE", "pt"],
    ["", "pt"],
    [null, "pt"],
  ])("%j → %s", (header, expected) => {
    expect(shortcutLanguage(header)).toBe(expected);
  });
});
