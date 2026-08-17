import { describe, expect, it } from "vitest";
import { formatDateTime, formatInstant, formatShortDate } from "./format";

// O dia de um lançamento é lido em UTC, então é determinístico. A hora segue o
// fuso da máquina, então é conferida pelo formato, não pelo valor.
const DIA_16 = new Date("2026-08-16T00:00:00.000Z");

describe("formatDateTime", () => {
  it("mostra só o dia quando o lançamento não tem hora de cadastro", () => {
    expect(formatDateTime(DIA_16)).toBe("16/08/26");
    expect(formatDateTime(DIA_16, null)).toBe("16/08/26");
  });

  it("acrescenta a hora do cadastro quando ela existe", () => {
    const result = formatDateTime(DIA_16, new Date("2026-08-16T18:05:00.000Z"));
    expect(result).toMatch(/^16\/08\/26 \d{2}:\d{2}$/);
  });

  it("lê o dia em UTC, e não no fuso local", () => {
    // Meia-noite UTC do dia 1º viraria "31/07/26" se lida em fuso negativo.
    expect(formatDateTime(new Date("2026-08-01T00:00:00.000Z"))).toBe("01/08/26");
  });
});

describe("formatInstant", () => {
  it("junta dia e hora do mesmo fuso local", () => {
    expect(formatInstant(new Date("2026-08-16T18:05:00.000Z"))).toMatch(
      /^\d{2}\/\d{2}\/\d{2} \d{2}:\d{2}$/,
    );
  });
});

describe("formatShortDate", () => {
  it("escreve o dia com dois dígitos e o ano com dois", () => {
    expect(formatShortDate(DIA_16, "UTC")).toBe("16/08/26");
  });

  it("preenche com zero à esquerda", () => {
    expect(formatShortDate(new Date("2026-01-09T00:00:00.000Z"), "UTC")).toBe("09/01/26");
  });
});
