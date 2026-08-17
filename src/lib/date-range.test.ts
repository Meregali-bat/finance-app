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

  it("cobre só o dia de hoje no modo hoje", () => {
    const today = new Date(2026, 7, 13, 15, 42); // com hora, como vem de `new Date()`
    const range = resolveRange({ range: "hoje" }, today);
    expect(range.mode).toBe("hoje");
    expect(range.rangeStart).toEqual(new Date(2026, 7, 13));
    expect(range.rangeEnd).toEqual(new Date(2026, 7, 14));
  });

  it("ancora o dia no from, e não em hoje", () => {
    const range = resolveRange({ range: "hoje", from: "2026-08-03" }, new Date(2026, 7, 13));
    expect(range.rangeStart).toEqual(new Date(2026, 7, 3));
    expect(range.rangeEnd).toEqual(new Date(2026, 7, 4));
  });

  it("volta para hoje quando a âncora do dia não é uma data", () => {
    const range = resolveRange({ range: "hoje", from: "ontem" }, new Date(2026, 7, 13));
    expect(range.rangeStart).toEqual(new Date(2026, 7, 13));
  });

  it('chama o dia corrente de "Hoje" e os outros pela data', () => {
    const today = new Date(2026, 7, 13);
    expect(resolveRange({ range: "hoje" }, today).label).toBe("Hoje");
    expect(resolveRange({ range: "hoje", from: "2026-08-10" }, today).label).toBe("10 de ago.");
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

describe("bordas em UTC", () => {
  // Um lançamento do dia 16 é gravado como 16/08 00:00Z. Comparado com a borda
  // local (16/08 00:00-03:00) ele cairia no dia 15 — o filtro de um dia só
  // mostraria sempre os lançamentos do dia seguinte.
  it("cobre o dia do lançamento, e não o anterior", () => {
    const range = resolveRange({ range: "hoje", from: "2026-08-16" }, new Date(2026, 7, 17));
    const lancamentoDoDia16 = new Date("2026-08-16T00:00:00.000Z");
    expect(range.utcRangeStart.getTime()).toBeLessThanOrEqual(lancamentoDoDia16.getTime());
    expect(range.utcRangeEnd.getTime()).toBeGreaterThan(lancamentoDoDia16.getTime());
  });

  it("acompanha os mesmos dias do calendário das bordas locais", () => {
    const range = resolveRange({ range: "mes", month: "2026-08" }, new Date(2026, 7, 13));
    expect(range.utcRangeStart.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(range.utcRangeEnd.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("fecha o dia seguinte para fora no modo hoje", () => {
    const range = resolveRange({ range: "hoje", from: "2026-08-16" }, new Date(2026, 7, 17));
    expect(range.utcRangeStart.toISOString()).toBe("2026-08-16T00:00:00.000Z");
    expect(range.utcRangeEnd.toISOString()).toBe("2026-08-17T00:00:00.000Z");
  });
});

describe("previousRangeParams e nextRangeParams", () => {
  const at = (params: RangeParams) => resolveRange(params, new Date(2026, 7, 13));

  it("anda um dia de cada vez no modo hoje", () => {
    const day = at({ range: "hoje", from: "2026-08-13" });
    expect(previousRangeParams(day)).toEqual({ range: "hoje", from: "2026-08-12" });
    expect(nextRangeParams(day)).toEqual({ range: "hoje", from: "2026-08-14" });
  });

  it("vira o mês ao andar de dia no modo hoje", () => {
    const lastDay = at({ range: "hoje", from: "2026-08-31" });
    expect(nextRangeParams(lastDay)).toEqual({ range: "hoje", from: "2026-09-01" });
  });

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

describe("navegar clique a clique", () => {
  // Uma seta clicada N vezes tem que andar N passos, nem mais nem menos: o
  // resultado de um clique vira a URL que o proximo clique le de volta.
  function walk(start: RangeParams, steps: number, dir: "prev" | "next") {
    const today = new Date(2026, 7, 17);
    let range = resolveRange(start, today);
    const days = [range.rangeStart.getDate()];
    for (let i = 0; i < steps; i++) {
      range = resolveRange(dir === "prev" ? previousRangeParams(range) : nextRangeParams(range), today);
      days.push(range.rangeStart.getDate());
    }
    return days;
  }

  it("anda exatamente um dia por clique para tras", () => {
    expect(walk({ range: "hoje" }, 3, "prev")).toEqual([17, 16, 15, 14]);
  });

  it("anda exatamente um dia por clique para frente", () => {
    expect(walk({ range: "hoje" }, 3, "next")).toEqual([17, 18, 19, 20]);
  });

  it("anda exatamente sete dias por clique no modo semana", () => {
    expect(walk({ range: "semana", from: "2026-08-17" }, 2, "prev")).toEqual([17, 10, 3]);
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
