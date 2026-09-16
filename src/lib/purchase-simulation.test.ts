import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMMITMENT_LIMIT_PERCENT,
  MAX_SIMULATION_INSTALLMENTS,
  simulatePurchase,
  type SimulatePurchaseInput,
} from "./purchase-simulation";

/**
 * Um dia de calendário do jeito que o banco guarda: meia-noite UTC. Mesma
 * razão do helper homônimo em forecast.test.ts — ver `storedDay` em period.ts.
 */
function storedDate(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day));
}

/**
 * Hoje é 10/set/2026, salário de R$ 5.000 todo dia 5: o período corrente vai
 * de 05/set a 05/out, o seguinte de 05/out a 05/nov, e assim por diante.
 *
 * O cartão fecha dia 20 e vence dia 28. Uma compra feita hoje (dia 10) fecha
 * no ciclo de 20/set e é cobrada na fatura de 28/set — dentro do período
 * corrente.
 */
const today = new Date(2026, 8, 10);

const base: SimulatePurchaseInput = {
  incomes: [{ id: "salario", label: "Salário", amount: 5000, dayOfMonth: 5 }],
  fixedExpenses: [],
  creditCards: [{ id: "nubank", name: "Nubank", closingDay: 20, dueDay: 28 }],
  cardPurchases: [],
  transactions: [],
  today,
  // Literal, e não a constante: os casos abaixo foram escritos com contas de
  // cabeça em cima de 30% de 5.000, e amarrá-los ao padrão faria mudá-lo
  // quebrar dezenas de testes que não são sobre o padrão.
  commitmentLimitPercent: 30,
  purchase: {
    cardId: "nubank",
    amount: 1000,
    date: storedDate(2026, 8, 10),
    installments: 1,
  },
};

function simulate(overrides: Partial<SimulatePurchaseInput> = {}) {
  return simulatePurchase({
    ...base,
    ...overrides,
    purchase: { ...base.purchase, ...overrides.purchase },
  });
}

describe("simulatePurchase — o veredito", () => {
  it("aprova a compra que cabe na sobra e no teto", () => {
    const result = simulate({ purchase: { ...base.purchase, amount: 1000 } });

    expect(result.approved).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it("reprova quando a sobra de algum período ficaria negativa", () => {
    // Renda de 5.000 no período e uma compra de 6.000 à vista: a fatura sozinha
    // passa do que entra.
    const result = simulate({ purchase: { ...base.purchase, amount: 6000 } });

    expect(result.approved).toBe(false);
    expect(result.blockers).toContain("negativeBalance");
  });

  it("reprova por comprometimento mesmo quando ainda sobra dinheiro", () => {
    // 2.000 de 5.000 é 40% — passa dos 30%, mas deixa 3.000 de sobra. É
    // exatamente o caso que a régua da sobra sozinha deixaria passar.
    const result = simulate({ purchase: { ...base.purchase, amount: 2000 } });

    expect(result.approved).toBe(false);
    expect(result.blockers).toEqual(["overCommitment"]);
    expect(result.periods[0].balanceAfter).toBeGreaterThan(0);
  });

  it("acumula os dois motivos quando a compra estoura as duas réguas", () => {
    const result = simulate({ purchase: { ...base.purchase, amount: 6000 } });

    expect(result.blockers).toEqual(["negativeBalance", "overCommitment"]);
  });

  it("conta as despesas fixas no comprometimento, não só a fatura", () => {
    // Aluguel de 1.400 já come 28% da renda; sobram 100 antes dos 30%, então
    // uma compra de 500 à vista estoura o teto sem derrubar a sobra.
    const result = simulate({
      fixedExpenses: [{ id: "aluguel", label: "Aluguel", amount: 1400, dueDay: 10 }],
      purchase: { ...base.purchase, amount: 500 },
    });

    expect(result.blockers).toEqual(["overCommitment"]);
    expect(result.periods[0].commitment.before).toBeCloseTo(0.28, 5);
    expect(result.periods[0].commitment.after).toBeCloseTo(0.38, 5);
  });

  it("respeita um teto configurado diferente do padrão", () => {
    // A mesma compra de 2.000 que falha em 30% passa em 50%.
    const result = simulate({
      commitmentLimitPercent: 50,
      purchase: { ...base.purchase, amount: 2000 },
    });

    expect(result.approved).toBe(true);
  });

  it("deixa 30% da renda livres no teto padrão", () => {
    // O padrão é sobre o que SOBRA: 70% comprometido, 30% livres. Com aluguel
    // de 2.000 (40%) e uma compra de 1.400 (28%), o comprometimento vai a 68% —
    // passa. Um centavo a mais de despesa fixa e não passaria.
    const result = simulate({
      commitmentLimitPercent: DEFAULT_COMMITMENT_LIMIT_PERCENT,
      fixedExpenses: [{ id: "aluguel", label: "Aluguel", amount: 2000, dueDay: 10 }],
      purchase: { ...base.purchase, amount: 1400 },
    });

    expect(DEFAULT_COMMITMENT_LIMIT_PERCENT).toBe(70);
    expect(result.periods[0].commitment.after).toBeCloseTo(0.68, 5);
    expect(result.approved).toBe(true);
  });

  it("não dá veredito sem nenhuma renda cadastrada", () => {
    // Sem renda não há período de onde tirar uma projeção, e um SIM aqui seria
    // um SIM sobre nada.
    const result = simulate({ incomes: [] });

    expect(result.approved).toBe(false);
    expect(result.blockers).toEqual(["noIncome"]);
    expect(result.periods).toEqual([]);
  });
});

describe("simulatePurchase — o parcelamento", () => {
  it("espalha as parcelas pelos períodos que elas de fato tocam", () => {
    const result = simulate({ purchase: { ...base.purchase, amount: 3000, installments: 3 } });

    expect(result.periods).toHaveLength(3);
    expect(result.periods.map((p) => p.offset)).toEqual([0, 1, 2]);
    expect(result.periods.map((p) => p.installmentAmount)).toEqual([1000, 1000, 1000]);
    expect(result.approved).toBe(true);
  });

  it("informa a parcela e as faturas de primeira e última cobrança", () => {
    const result = simulate({ purchase: { ...base.purchase, amount: 3000, installments: 3 } });

    expect(result.installmentAmount).toBe(1000);
    expect(result.firstDueDate).toEqual(new Date(2026, 8, 28));
    expect(result.lastDueDate).toEqual(new Date(2026, 10, 28));
  });

  it("põe o resto dos centavos na primeira parcela, como installmentSlices", () => {
    // 100,00 em 3x: 33,34 + 33,33 + 33,33.
    const result = simulate({ purchase: { ...base.purchase, amount: 100, installments: 3 } });

    expect(result.installmentAmount).toBeCloseTo(33.34, 2);
    expect(result.periods[0].installmentAmount).toBeCloseTo(33.34, 2);
    expect(result.periods[1].installmentAmount).toBeCloseTo(33.33, 2);
  });

  it("pula a fatura já fechada quando a compra é depois do fechamento", () => {
    // Compra em 25/set, com fechamento no dia 20: o ciclo de setembro já
    // fechou, então a primeira parcela só cai na fatura de 28/out — período 1.
    const result = simulate({
      purchase: { ...base.purchase, date: storedDate(2026, 8, 25), installments: 2 },
    });

    expect(result.firstDueDate).toEqual(new Date(2026, 9, 28));
    expect(result.periods.map((p) => p.offset)).toEqual([1, 2]);
  });

  it("aceita compra com data no passado", () => {
    // Uma compra de 01/set entra no mesmo ciclo que fecha em 20/set.
    const result = simulate({ purchase: { ...base.purchase, date: storedDate(2026, 8, 1) } });

    expect(result.firstDueDate).toEqual(new Date(2026, 8, 28));
    expect(result.periods[0].offset).toBe(0);
  });

  it("projeta períodos suficientes quando há duas rendas por mês", () => {
    // Dois pagamentos por mês dobram o número de períodos: 3 parcelas cobrem
    // três meses, que aqui são seis períodos — e não três.
    const result = simulate({
      incomes: [
        { id: "salario", label: "Salário", amount: 3000, dayOfMonth: 5 },
        { id: "freela", label: "Freela", amount: 2000, dayOfMonth: 20 },
      ],
      purchase: { ...base.purchase, amount: 300, installments: 3 },
    });

    expect(result.firstDueDate).toEqual(new Date(2026, 8, 28));
    expect(result.lastDueDate).toEqual(new Date(2026, 10, 28));
    // A fatura vence dia 28, sempre no período que abre no dia 20.
    expect(result.periods).toHaveLength(3);
    expect(result.truncatedAfter).toBeNull();
  });

  it("avisa quando as parcelas passam do horizonte projetado", () => {
    // Quatro pagamentos por mês: 24 parcelas viram quase cem ciclos, bem além
    // dos 60 que a simulação projeta.
    const result = simulate({
      purchase: { ...base.purchase, amount: 24000, installments: MAX_SIMULATION_INSTALLMENTS },
      incomes: [
        { id: "semana1", label: "Semana 1", amount: 1250, dayOfMonth: 5 },
        { id: "semana2", label: "Semana 2", amount: 1250, dayOfMonth: 12 },
        { id: "semana3", label: "Semana 3", amount: 1250, dayOfMonth: 19 },
        { id: "semana4", label: "Semana 4", amount: 1250, dayOfMonth: 26 },
      ],
    });

    expect(result.truncatedAfter).not.toBeNull();
    // O que ficou de fora é dito em dinheiro, e a compra não recebe um SIM.
    expect(result.unevaluatedAmount).toBeGreaterThan(0);
    expect(result.approved).toBe(false);
  });

  it("não trunca um 24x de quem recebe duas vezes por mês", () => {
    // São 49 ciclos — o motivo de o horizonte ser 60 e não 24.
    const result = simulate({
      purchase: { ...base.purchase, amount: 2400, installments: MAX_SIMULATION_INSTALLMENTS },
      incomes: [
        { id: "salario", label: "Salário", amount: 3000, dayOfMonth: 5 },
        { id: "freela", label: "Freela", amount: 2000, dayOfMonth: 20 },
      ],
    });

    expect(result.truncatedAfter).toBeNull();
    expect(result.unevaluatedAmount).toBe(0);
    expect(result.periods).toHaveLength(MAX_SIMULATION_INSTALLMENTS);
  });

  it("mede o comprometimento no mês, e não no ciclo, para quem recebe duas vezes", () => {
    // Aluguel de 1.400 vencendo dia 10 cai inteiro no ciclo [05, 20), que só
    // tem o salário de 3.000 — 47% medido por ciclo. No mês são 1.400 sobre
    // 5.000, 28%, e é essa a conta que decide.
    const result = simulate({
      incomes: [
        { id: "salario", label: "Salário", amount: 3000, dayOfMonth: 5 },
        { id: "freela", label: "Freela", amount: 2000, dayOfMonth: 20 },
      ],
      fixedExpenses: [{ id: "aluguel", label: "Aluguel", amount: 1400, dueDay: 10 }],
      purchase: { ...base.purchase, amount: 100 },
    });

    expect(result.periods[0].commitment.income).toBe(5000);
    expect(result.periods[0].commitment.before).toBeCloseTo(0.28, 5);
    expect(result.approved).toBe(true);
  });
});

describe("simulatePurchase — o que caberia", () => {
  it("diz o maior total que passaria com o mesmo número de parcelas", () => {
    // 30% de 5.000 é 1.500, e não há despesa fixa nenhuma: o teto é o que
    // aperta primeiro.
    const result = simulate({ purchase: { ...base.purchase, amount: 4000 } });

    expect(result.maxAffordableAmount).toBeCloseTo(1500, 2);
  });

  it("o total sugerido de fato passa na simulação", () => {
    const rejected = simulate({ purchase: { ...base.purchase, amount: 4000 } });
    const retry = simulate({
      purchase: { ...base.purchase, amount: rejected.maxAffordableAmount },
    });

    expect(retry.approved).toBe(true);
  });

  it("um centavo acima do sugerido já não passa", () => {
    const rejected = simulate({ purchase: { ...base.purchase, amount: 4000 } });
    const retry = simulate({
      purchase: { ...base.purchase, amount: rejected.maxAffordableAmount + 0.01 },
    });

    expect(retry.approved).toBe(false);
  });

  it("divide a folga pelo número de parcelas do período, não pelo total", () => {
    const result = simulate({ purchase: { ...base.purchase, amount: 9000, installments: 3 } });

    // Cada período aguenta 1.500 de parcela, e são três parcelas em três
    // períodos distintos: 4.500 no total.
    expect(result.maxAffordableAmount).toBeCloseTo(4500, 2);
  });

  it("diz em quantas parcelas o mesmo total passaria", () => {
    // 3.000 com folga de 1.500 por período: em 2x cada parcela fica em 1.500,
    // exatamente no teto.
    const result = simulate({ purchase: { ...base.purchase, amount: 3000 } });

    expect(result.minInstallments).toBe(2);
  });

  it("o número de parcelas sugerido de fato passa na simulação", () => {
    const rejected = simulate({ purchase: { ...base.purchase, amount: 4000 } });
    const retry = simulate({
      purchase: { ...base.purchase, installments: rejected.minInstallments! },
    });

    expect(rejected.minInstallments).not.toBeNull();
    expect(retry.approved).toBe(true);
  });

  it("não sugere parcelamento quando nem ele resolve", () => {
    // Aluguel de 1.600 já consome 32% da renda: o teto está estourado antes de
    // qualquer compra, e nenhum número de parcelas conserta isso.
    const result = simulate({
      fixedExpenses: [{ id: "aluguel", label: "Aluguel", amount: 1600, dueDay: 10 }],
      purchase: { ...base.purchase, amount: 500 },
    });

    expect(result.maxAffordableAmount).toBe(0);
    expect(result.minInstallments).toBeNull();
  });

  it("não sugere nada quando a compra já foi aprovada", () => {
    const result = simulate({ purchase: { ...base.purchase, amount: 1000 } });

    expect(result.approved).toBe(true);
    expect(result.minInstallments).toBeNull();
  });
});

describe("simulatePurchase — o contexto que a tela mostra", () => {
  it("aponta o período que mais aperta", () => {
    // Uma despesa fixa só no segundo período faz dele o gargalo.
    const result = simulate({
      fixedExpenses: [
        { id: "ipva", label: "IPVA", amount: 3000, dueDay: 15, createdAt: new Date(2026, 9, 1) },
      ],
      purchase: { ...base.purchase, amount: 3000, installments: 3 },
    });

    expect(result.worstPeriod?.offset).toBe(1);
  });

  it("compara a sobra de antes e depois em cada período tocado", () => {
    const result = simulate({ purchase: { ...base.purchase, amount: 2000, installments: 2 } });

    expect(result.periods[0].balanceBefore).toBe(5000);
    expect(result.periods[0].balanceAfter).toBe(4000);
    expect(result.periods[1].balanceBefore).toBe(5000);
    expect(result.periods[1].balanceAfter).toBe(4000);
  });

  it("devolve o uso do limite do cartão quando ele tem limite informado", () => {
    const result = simulate({
      creditCards: [
        { id: "nubank", name: "Nubank", closingDay: 20, dueDay: 28, creditLimit: 10000 },
      ],
    });

    expect(result.limitUsage).not.toBeNull();
    expect(result.limitUsage?.limit).toBe(10000);
  });

  it("devolve limite nulo quando o cartão não tem limite informado", () => {
    expect(simulate().limitUsage).toBeNull();
  });

  it("mostra a sobra por dia encolhendo, que é o número que a régua esconde", () => {
    // A régua aprova um ciclo que fecha em R$ 0,01, e `balance` não reserva
    // nada para o gasto do dia a dia. Ver o diário cair é o que impede um SIM
    // tecnicamente correto de enganar.
    const result = simulate({ purchase: { ...base.purchase, amount: 1200 } });

    expect(result.periods[0].dailyAfter).toBeLessThan(result.periods[0].dailyBefore);
    expect(result.periods[0].dailyAfter).toBeCloseTo(3800 / 30, 5);
  });

  it("avisa quando o ciclo já estava reprovado antes da compra", () => {
    // Aluguel de 6.000 contra renda de 5.000: o mês já fecha no vermelho, e
    // culpar a compra mandaria o usuário consertar a coisa errada.
    const result = simulate({
      fixedExpenses: [{ id: "aluguel", label: "Aluguel", amount: 6000, dueDay: 10 }],
      purchase: { ...base.purchase, amount: 100 },
    });

    expect(result.approved).toBe(false);
    expect(result.alreadyFailing).toBe(true);
    expect(result.periods[0].alreadyFailing).toBe(true);
  });

  it("não marca como já reprovado o ciclo que só estoura por causa da compra", () => {
    const result = simulate({ purchase: { ...base.purchase, amount: 6000 } });

    expect(result.approved).toBe(false);
    expect(result.alreadyFailing).toBe(false);
  });

  it("não mede comprometimento de um período sem renda", () => {
    // A renda foi cadastrada em novembro, então as ocorrências de setembro e
    // outubro não valem: esses períodos não têm de onde tirar uma porcentagem.
    const result = simulate({
      incomes: [
        {
          id: "salario",
          label: "Salário",
          amount: 5000,
          dayOfMonth: 5,
          createdAt: new Date(2026, 10, 1),
        },
      ],
      purchase: { ...base.purchase, amount: 100 },
    });

    expect(result.periods[0].commitment.before).toBeNull();
    expect(result.periods[0].commitment.after).toBeNull();
    expect(result.blockers).not.toContain("overCommitment");
  });
});
