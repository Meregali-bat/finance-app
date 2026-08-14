import { describe, expect, it } from "vitest";
import {
  dayParam,
  monthParam,
  nextRangeParams,
  previousRangeParams,
  rangeHref,
  resolveRange,
  type RangeParams,
} from "./date-range";

describe("resolveRange", () => {
  it("cai no mês corrente quando não vem nenhum parâmetro", () => {
    const today = new Date(2026, 7, 13); // 13/ago/2026
    const range = resolveRange({}, today);
    expect(range.mode).toBe("mes");
    expect(range.rangeStart).toEqual(new Date(2026, 7, 1));
    expect(range.rangeEnd).toEqual(new Date(2026, 8, 1));
    expect(range.month).toEqual({ year: 2026, monthIndex: 7 });
  });

  it("usa o mês pedido no parâmetro month", () => {
    const range = resolveRange({ range: "mes", month: "2026-02" }, new Date(2026, 7, 13));
    expect(range.rangeStart).toEqual(new Date(2026, 1, 1));
    expect(range.rangeEnd).toEqual(new Date(2026, 2, 1));
  });

  it("ignora um month malformado e volta para o mês corrente", () => {
    const range = resolveRange({ range: "mes", month: "abril" }, new Date(2026, 7, 13));
    expect(range.rangeStart).toEqual(new Date(2026, 7, 1));
  });

  it("abre a semana na segunda-feira e fecha sete dias depois", () => {
    const wednesday = new Date(2026, 7, 12);
    const range = resolveRange({ range: "semana" }, wednesday);
    expect(range.mode).toBe("semana");
    expect(range.rangeStart).toEqual(new Date(2026, 7, 10)); // segunda
    expect(range.rangeEnd).toEqual(new Date(2026, 7, 17)); // segunda seguinte
  });

  it("mantém o domingo na semana que começou na segunda anterior", () => {
    // Domingo é o fim da semana em pt-BR, não o começo: dia 16 pertence à
    // semana do dia 10, não à que abre no dia 17.
    const sunday = new Date(2026, 7, 16);
    const range = resolveRange({ range: "semana" }, sunday);
    expect(range.rangeStart).toEqual(new Date(2026, 7, 10));
  });

  it("inclui o último dia do intervalo personalizado", () => {
    const range = resolveRange(
      { range: "custom", from: "2026-08-01", to: "2026-08-10" },
      new Date(2026, 7, 13),
    );
    expect(range.mode).toBe("custom");
    expect(range.rangeStart).toEqual(new Date(2026, 7, 1));
    expect(range.rangeEnd).toEqual(new Date(2026, 7, 11));
  });

  it("aceita um intervalo personalizado de um único dia", () => {
    const range = resolveRange(
      { range: "custom", from: "2026-08-05", to: "2026-08-05" },
      new Date(2026, 7, 13),
    );
    expect(range.rangeStart).toEqual(new Date(2026, 7, 5));
    expect(range.rangeEnd).toEqual(new Date(2026, 7, 6));
  });

  it("inverte um intervalo personalizado preenchido ao contrário", () => {
    const range = resolveRange(
      { range: "custom", from: "2026-08-20", to: "2026-08-02" },
      new Date(2026, 7, 13),
    );
    expect(range.rangeStart).toEqual(new Date(2026, 7, 2));
    expect(range.rangeEnd).toEqual(new Date(2026, 7, 21));
  });

  it("volta para o mês corrente enquanto o intervalo personalizado está incompleto", () => {
    const range = resolveRange({ range: "custom", from: "2026-08-01" }, new Date(2026, 7, 13));
    expect(range.mode).toBe("mes");
    expect(range.rangeStart).toEqual(new Date(2026, 7, 1));
    expect(range.rangeEnd).toEqual(new Date(2026, 8, 1));
  });

  it("nomeia o mês por extenso", () => {
    const range = resolveRange({ range: "mes", month: "2026-08" }, new Date(2026, 7, 13));
    expect(range.label).toBe("agosto de 2026");
  });

  it("nomeia a semana pelo primeiro e pelo último dia, não pelo fim exclusivo", () => {
    const range = resolveRange({ range: "semana" }, new Date(2026, 7, 12));
    expect(range.label).toBe("10 de ago. – 16 de ago.");
  });

  it("ancora a semana no from, e não em hoje", () => {
    const range = resolveRange({ range: "semana", from: "2026-08-03" }, new Date(2026, 7, 13));
    expect(range.rangeStart).toEqual(new Date(2026, 7, 3));
    expect(range.rangeEnd).toEqual(new Date(2026, 7, 10));
  });

  it("recua a âncora da semana para a segunda-feira dela", () => {
    // Quarta-feira: a semana continua abrindo na segunda anterior.
    const range = resolveRange({ range: "semana", from: "2026-08-05" }, new Date(2026, 7, 13));
    expect(range.rangeStart).toEqual(new Date(2026, 7, 3));
  });

  it("volta para a semana de hoje quando a âncora não é uma data", () => {
    const range = resolveRange({ range: "semana", from: "semana passada" }, new Date(2026, 7, 12));
    expect(range.rangeStart).toEqual(new Date(2026, 7, 10));
  });
});

describe("previousRangeParams e nextRangeParams", () => {
  const at = (params: RangeParams) => resolveRange(params, new Date(2026, 7, 13));

  it("anda um mês de cada vez no modo mês", () => {
    const august = at({ range: "mes", month: "2026-08" });
    expect(previousRangeParams(august)).toEqual({ range: "mes", month: "2026-07" });
    expect(nextRangeParams(august)).toEqual({ range: "mes", month: "2026-09" });
  });

  it("vira o ano ao passar de dezembro para janeiro", () => {
    const december = at({ range: "mes", month: "2026-12" });
    expect(nextRangeParams(december)).toEqual({ range: "mes", month: "2027-01" });
  });

  it("vira o ano ao voltar de janeiro para dezembro", () => {
    const january = at({ range: "mes", month: "2026-01" });
    expect(previousRangeParams(january)).toEqual({ range: "mes", month: "2025-12" });
  });

  it("anda sete dias de cada vez no modo semana", () => {
    const week = at({ range: "semana", from: "2026-08-10" });
    expect(previousRangeParams(week)).toEqual({ range: "semana", from: "2026-08-03" });
    expect(nextRangeParams(week)).toEqual({ range: "semana", from: "2026-08-17" });
  });

  it("anda pela duração do próprio intervalo no modo personalizado", () => {
    const tenDays = at({ range: "custom", from: "2026-08-01", to: "2026-08-10" });
    expect(previousRangeParams(tenDays)).toEqual({
      range: "custom",
      from: "2026-07-22",
      to: "2026-07-31",
    });
    expect(nextRangeParams(tenDays)).toEqual({
      range: "custom",
      from: "2026-08-11",
      to: "2026-08-20",
    });
  });

  it("preserva a duração do intervalo personalizado ao navegar", () => {
    const tenDays = at({ range: "custom", from: "2026-08-01", to: "2026-08-10" });
    const previous = at(previousRangeParams(tenDays));
    expect(previous.rangeStart).toEqual(new Date(2026, 6, 22));
    expect(previous.rangeEnd).toEqual(new Date(2026, 7, 1));
  });
});

describe("dayParam", () => {
  it("escreve o dia local, sem passar por UTC", () => {
    // `toISOString()` devolveria o dia anterior em qualquer fuso positivo.
    expect(dayParam(new Date(2026, 7, 1))).toBe("2026-08-01");
  });

  it("preenche mês e dia com zero à esquerda", () => {
    expect(dayParam(new Date(2026, 0, 9))).toBe("2026-01-09");
  });
});

describe("rangeHref", () => {
  it("monta a query a partir dos parâmetros", () => {
    expect(rangeHref({ range: "mes", month: "2026-07" })).toBe("?range=mes&month=2026-07");
  });

  it("deixa de fora o que não foi preenchido", () => {
    expect(rangeHref({ range: "semana" })).toBe("?range=semana");
  });
});

describe("monthParam", () => {
  it("preenche o mês com zero à esquerda", () => {
    expect(monthParam(2026, 0)).toBe("2026-01");
  });

  it("mapeia o índice do mês para o número do calendário", () => {
    expect(monthParam(2026, 11)).toBe("2026-12");
  });
});
