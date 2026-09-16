import { describe, expect, it } from "vitest";
import {
  DEFAULT_FORECAST_OFFSET,
  forecastPeriods,
  resolveForecastOffset,
  type ForecastEntry,
  type ForecastInput,
} from "./forecast";

/**
 * Um dia de calendário do jeito que o banco guarda: meia-noite UTC. Escrever
 * `new Date(2026, 8, 10)` faria o teste passar só em fuso negativo — ver o
 * comentário de `storedDay` em period.ts.
 */
function storedDate(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day));
}

// Hoje é 10/set/2026, com salário todo dia 5: o período corrente vai de 05/set
// a 05/out, e o próximo de 05/out a 05/nov.
const today = new Date(2026, 8, 10);

const base: ForecastInput = {
  incomes: [{ id: "salario", label: "Salário", amount: 5000, dayOfMonth: 5 }],
  fixedExpenses: [],
  creditCards: [],
  cardPurchases: [],
  transactions: [],
  today,
};

function forecast(overrides: Partial<ForecastInput> & { count?: number } = {}) {
  const { count = 2, ...rest } = overrides;
  return forecastPeriods({ ...base, ...rest, count });
}

function entriesOf(periods: ReturnType<typeof forecast>, offset: number, kind: string) {
  return periods[offset].entries.filter((entry: ForecastEntry) => entry.kind === kind);
}

describe("forecastPeriods — os limites dos ciclos", () => {
  it("encadeia os períodos a partir do corrente", () => {
    const periods = forecast();

    expect(periods).toHaveLength(3);
    expect(periods[0].periodStart).toEqual(new Date(2026, 8, 5));
    expect(periods[0].periodEnd).toEqual(new Date(2026, 9, 5));
    expect(periods[1].periodStart).toEqual(new Date(2026, 9, 5));
    expect(periods[1].periodEnd).toEqual(new Date(2026, 10, 5));
    expect(periods[2].periodStart).toEqual(new Date(2026, 10, 5));
    expect(periods[2].periodEnd).toEqual(new Date(2026, 11, 5));
  });

  it("numera os períodos a partir de zero, que é o corrente", () => {
    expect(forecast().map((p) => p.offset)).toEqual([0, 1, 2]);
  });

  it("encurta o ciclo quando o dia de pagamento não cabe no mês seguinte", () => {
    // Pagamento no dia 31: janeiro tem, fevereiro não — o ciclo de fevereiro
    // fecha no dia 28.
    const periods = forecastPeriods({
      ...base,
      incomes: [{ id: "salario", label: "Salário", amount: 5000, dayOfMonth: 31 }],
      today: new Date(2027, 0, 31),
      count: 1,
    });

    expect(periods[0].periodStart).toEqual(new Date(2027, 0, 31));
    expect(periods[0].periodEnd).toEqual(new Date(2027, 1, 28));
    expect(periods[1].periodEnd).toEqual(new Date(2027, 2, 31));
  });

  it("combina várias rendas em ciclos mais curtos", () => {
    const periods = forecastPeriods({
      ...base,
      incomes: [
        { id: "salario", label: "Salário", amount: 5000, dayOfMonth: 5 },
        { id: "freela", label: "Freela", amount: 800, dayOfMonth: 20 },
      ],
      count: 1,
    });

    expect(periods[0].periodEnd).toEqual(new Date(2026, 8, 20));
    expect(periods[1].periodStart).toEqual(new Date(2026, 8, 20));
    expect(periods[1].periodEnd).toEqual(new Date(2026, 9, 5));
  });

  it("devolve lista vazia sem nenhuma renda, em vez de um ciclo de um dia", () => {
    expect(forecast({ incomes: [] })).toEqual([]);
  });

  it("limita a projeção ao teto, mesmo pedindo mais", () => {
    expect(forecastPeriods({ ...base, count: 999 })).toHaveLength(13);
  });

  it("aceita um teto maior que o padrão, para quem precisa alcançar mais longe", () => {
    expect(forecastPeriods({ ...base, count: 999, maxOffset: 24 })).toHaveLength(25);
  });
});

describe("forecastPeriods — renda", () => {
  it("projeta a renda futura pelo valor cadastrado, que ainda não foi confirmado", () => {
    const periods = forecast({ count: 1 });
    const proximo = periods[1];

    expect(entriesOf(periods, 1, "income")).toEqual([
      {
        kind: "income",
        sourceId: "salario",
        label: "Salário",
        date: new Date(2026, 9, 5),
        amount: 5000,
        confirmed: false,
      },
    ]);
    expect(proximo.incomeTotal).toBe(5000);
  });

  it("usa o valor realmente recebido quando a ocorrência já foi confirmada", () => {
    const periods = forecast({
      incomeReceipts: [
        { incomeId: "salario", occurrenceDate: storedDate(2026, 8, 5), amount: 5250 },
      ],
    });

    expect(periods[0].incomeTotal).toBe(5250);
    expect(periods[0].entries[0].confirmed).toBe(true);
    // A confirmação vale só para a ocorrência dela; o ciclo seguinte segue
    // projetado pelo valor cadastrado.
    expect(periods[1].incomeTotal).toBe(5000);
    expect(periods[1].entries[0].confirmed).toBe(false);
  });

  it("ignora a ocorrência anterior ao cadastro da renda", () => {
    const periods = forecastPeriods({
      ...base,
      incomes: [
        { id: "salario", label: "Salário", amount: 5000, dayOfMonth: 5 },
        { id: "novo", label: "Novo", amount: 900, dayOfMonth: 5, createdAt: new Date(2026, 9, 20) },
      ],
      count: 2,
    });

    // A renda nova nasceu depois do pagamento de outubro: ela só passa a
    // contar a partir da ocorrência de novembro.
    expect(entriesOf(periods, 1, "income").map((e) => e.sourceId)).toEqual(["salario"]);
    expect(entriesOf(periods, 2, "income").map((e) => e.sourceId)).toEqual(["salario", "novo"]);
  });
});

describe("forecastPeriods — despesa fixa", () => {
  const aluguel = { id: "aluguel", label: "Aluguel", amount: 1800, dueDay: 10 };

  it("projeta cada vencimento do período", () => {
    const periods = forecast({ fixedExpenses: [aluguel] });

    expect(entriesOf(periods, 1, "fixedExpense")).toEqual([
      {
        kind: "fixedExpense",
        sourceId: "aluguel",
        label: "Aluguel",
        date: new Date(2026, 9, 10),
        amount: 1800,
        confirmed: false,
      },
    ]);
    expect(periods[1].fixedExpenseTotal).toBe(1800);
  });

  it("usa o valor realmente pago quando a ocorrência já foi quitada", () => {
    const periods = forecast({
      fixedExpenses: [aluguel],
      expensePayments: [{ fixedExpenseId: "aluguel", dueDate: storedDate(2026, 8, 10), amount: 1850 }],
    });

    expect(periods[0].fixedExpenseTotal).toBe(1850);
    expect(entriesOf(periods, 0, "fixedExpense")[0].confirmed).toBe(true);
  });

  it("ignora o vencimento anterior ao cadastro da despesa", () => {
    const periods = forecast({
      fixedExpenses: [{ ...aluguel, createdAt: new Date(2026, 9, 20) }],
    });

    expect(entriesOf(periods, 1, "fixedExpense")).toEqual([]);
    expect(entriesOf(periods, 2, "fixedExpense")).toHaveLength(1);
  });

  it("cobra a despesa ligada a cartão só pela fatura, nunca duas vezes", () => {
    const periods = forecast({
      creditCards: [{ id: "c1", name: "Nubank", closingDay: 20, dueDay: 28 }],
      fixedExpenses: [{ id: "netflix", label: "Netflix", amount: 60, cardId: "c1" }],
    });

    expect(entriesOf(periods, 1, "fixedExpense")).toEqual([]);
    expect(periods[1].fixedExpenseTotal).toBe(0);
    expect(periods[1].cardBillTotal).toBe(60);
  });
});

describe("forecastPeriods — fatura de cartão", () => {
  const nubank = { id: "c1", name: "Nubank", closingDay: 20, dueDay: 28 };

  it("soma as compras já lançadas do ciclo que gerou a fatura", () => {
    const periods = forecast({
      creditCards: [nubank],
      cardPurchases: [
        { cardId: "c1", amount: 200, date: storedDate(2026, 7, 25) },
        { cardId: "c1", amount: 150, date: storedDate(2026, 8, 15) },
      ],
    });

    // Fatura de 28/set: ciclo de 21/ago a 20/set, as duas compras.
    const fatura = entriesOf(periods, 0, "cardBill")[0];
    expect(fatura.date).toEqual(new Date(2026, 8, 28));
    expect(fatura.amount).toBe(350);
  });

  it("marca como parcial a fatura de um ciclo que ainda não fechou", () => {
    const periods = forecast({
      creditCards: [nubank],
      cardPurchases: [{ cardId: "c1", amount: 100, date: storedDate(2026, 8, 15) }],
    });

    // O ciclo da fatura de 28/set fecha em 20/set, ainda à frente de hoje
    // (10/set): outras compras ainda podem cair nele.
    expect(entriesOf(periods, 0, "cardBill")[0].partial).toBe(true);
  });

  it("omite a fatura de um ciclo sem nenhuma compra lançada", () => {
    const periods = forecast({
      creditCards: [nubank],
      cardPurchases: [{ cardId: "c1", amount: 100, date: storedDate(2026, 8, 15) }],
    });

    // O ciclo da fatura de 28/out (21/set a 20/out) ainda não tem compra
    // nenhuma: prever zero seria inventar informação que não existe.
    expect(entriesOf(periods, 1, "cardBill")).toEqual([]);
  });

  it("não marca como parcial a fatura de um ciclo já fechado", () => {
    const periods = forecast({
      today: new Date(2026, 8, 25),
      creditCards: [nubank],
      cardPurchases: [{ cardId: "c1", amount: 100, date: storedDate(2026, 8, 15) }],
    });

    // Em 25/set o ciclo de 20/set já fechou; a fatura de 28/set é definitiva.
    expect(entriesOf(periods, 0, "cardBill")[0].partial).toBe(false);
  });

  it("espalha uma compra parcelada pelos ciclos que vão cobrá-la", () => {
    const periods = forecast({
      creditCards: [nubank],
      cardPurchases: [
        { cardId: "c1", amount: 900, date: storedDate(2026, 8, 15), installments: 3 },
      ],
    });

    // É por isso que a previsão sai de `buildCardBills`: as três parcelas
    // caem em três ciclos, e só o primeiro seria visível sem elas.
    expect(entriesOf(periods, 0, "cardBill")[0].amount).toBe(300);
    expect(entriesOf(periods, 1, "cardBill")[0].amount).toBe(300);
    expect(entriesOf(periods, 2, "cardBill")[0].amount).toBe(300);
  });

  it("soma a previsão que o usuário lançou à mão para uma fatura futura", () => {
    const periods = forecast({
      creditCards: [nubank],
      cardPurchases: [{ cardId: "c1", amount: 100, date: storedDate(2026, 9, 15) }],
      billEstimates: [{ cardId: "c1", dueDate: storedDate(2026, 9, 28), amount: 250 }],
    });

    expect(entriesOf(periods, 1, "cardBill")[0].amount).toBe(350);
  });

  it("usa o valor realmente pago quando a fatura já foi quitada", () => {
    const periods = forecast({
      creditCards: [nubank],
      cardPurchases: [{ cardId: "c1", amount: 100, date: storedDate(2026, 8, 15) }],
      expensePayments: [{ cardId: "c1", dueDate: storedDate(2026, 8, 28), amount: 100 }],
    });

    const fatura = entriesOf(periods, 0, "cardBill")[0];
    expect(fatura.confirmed).toBe(true);
    expect(fatura.partial).toBe(false);
  });
});

describe("forecastPeriods — movimentação agendada", () => {
  it("conta o lançamento com data dentro do período", () => {
    const periods = forecast({
      transactions: [
        { id: "t1", description: "Viagem", amount: 900, date: storedDate(2026, 9, 12) },
      ],
    });

    expect(periods[0].scheduledTotal).toBe(0);
    expect(entriesOf(periods, 1, "scheduled")).toEqual([
      {
        kind: "scheduled",
        sourceId: "t1",
        label: "Viagem",
        date: new Date(2026, 9, 12),
        amount: 900,
        confirmed: true,
      },
    ]);
    expect(periods[1].scheduledTotal).toBe(900);
  });

  it("conta como entrada o lançamento de receita, que fica negativo no banco", () => {
    const periods = forecast({
      transactions: [
        { id: "t1", description: "Bônus", amount: -1200, date: storedDate(2026, 9, 12) },
      ],
    });

    expect(periods[1].scheduledTotal).toBe(0);
    expect(periods[1].incomeTotal).toBe(5000 + 1200);
  });

  it("deixa de fora o lançamento posterior ao período", () => {
    const periods = forecast({
      count: 1,
      transactions: [
        { id: "t1", description: "Longe", amount: 300, date: storedDate(2027, 5, 1) },
      ],
    });

    expect(periods.flatMap((p) => p.entries).filter((e) => e.kind === "scheduled")).toEqual([]);
  });
});

describe("forecastPeriods — os totais", () => {
  it("desconta despesa fixa, fatura e agendados da renda prevista", () => {
    const periods = forecast({
      fixedExpenses: [{ id: "aluguel", label: "Aluguel", amount: 1800, dueDay: 10 }],
      creditCards: [{ id: "c1", name: "Nubank", closingDay: 20, dueDay: 28 }],
      cardPurchases: [{ cardId: "c1", amount: 700, date: storedDate(2026, 9, 15) }],
      transactions: [
        { id: "t1", description: "Viagem", amount: 500, date: storedDate(2026, 9, 12) },
      ],
    });

    const proximo = periods[1];
    expect(proximo.incomeTotal).toBe(5000);
    expect(proximo.fixedExpenseTotal).toBe(1800);
    expect(proximo.cardBillTotal).toBe(700);
    expect(proximo.scheduledTotal).toBe(500);
    expect(proximo.balance).toBe(2000);
  });

  it("divide o saldo pelos dias do ciclo inteiro, e não pelos que faltam", () => {
    const proximo = forecast({ count: 1 })[1];

    // 05/out a 05/nov são 31 dias.
    expect(proximo.totalDays).toBe(31);
    expect(proximo.dailyAvailable).toBeCloseTo(5000 / 31, 10);
  });

  it("ordena as ocorrências por data", () => {
    const proximo = forecast({
      count: 1,
      fixedExpenses: [{ id: "aluguel", label: "Aluguel", amount: 1800, dueDay: 10 }],
      transactions: [
        { id: "t1", description: "Viagem", amount: 500, date: storedDate(2026, 9, 7) },
      ],
    })[1];

    expect(proximo.entries.map((e) => e.sourceId)).toEqual(["salario", "t1", "aluguel"]);
  });
});

describe("resolveForecastOffset", () => {
  it("abre no próximo período quando não há parâmetro", () => {
    expect(resolveForecastOffset(undefined)).toBe(DEFAULT_FORECAST_OFFSET);
    expect(DEFAULT_FORECAST_OFFSET).toBe(1);
  });

  it("aceita um deslocamento válido", () => {
    expect(resolveForecastOffset("0")).toBe(0);
    expect(resolveForecastOffset("12")).toBe(12);
  });

  it("cai no padrão diante de lixo, negativo ou acima do teto", () => {
    expect(resolveForecastOffset("abc")).toBe(1);
    expect(resolveForecastOffset("-3")).toBe(1);
    expect(resolveForecastOffset("1.5")).toBe(1);
    expect(resolveForecastOffset("13")).toBe(1);
    expect(resolveForecastOffset("")).toBe(1);
  });

  it("usa o primeiro valor quando o parâmetro vem repetido na URL", () => {
    expect(resolveForecastOffset(["3", "7"])).toBe(3);
  });
});
