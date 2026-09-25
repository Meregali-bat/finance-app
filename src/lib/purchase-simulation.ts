/**
 * "Posso comprar isso?" — o efeito de uma compra parcelada sobre os próximos
 * ciclos, antes de ela existir.
 *
 * `forecast.ts` responde como vão estar os próximos períodos com o que já foi
 * lançado. Este módulo faz a mesma projeção duas vezes — uma sem a compra e
 * outra com ela — e compara. A diferença entre as duas é, por construção,
 * exatamente o peso das parcelas em cada ciclo: nada de parcelamento é
 * reimplementado aqui, `installmentSlices` e `buildCardBills` continuam sendo
 * a única fonte de "em qual fatura cada parcela cai".
 *
 * Duas réguas decidem, e as duas precisam passar:
 *
 * 1. O saldo projetado continua não-negativo em todo período a partir da
 *    primeira parcela. O saldo é encadeado — cada ciclo abre com o fechamento
 *    do anterior —, então uma parcela pesa no ciclo em que cai e em todos os
 *    seguintes, e a sobra de um mês bom pode cobrir a parcela de um mês justo.
 * 2. O comprometimento — despesas fixas mais faturas sobre a renda — fica
 *    dentro do teto configurado.
 *
 * A segunda existe porque a primeira sozinha aprova o mês que fecha no zero:
 * uma compra que consome toda a sobra "cabe" e mesmo assim não deveria ser
 * feita. A primeira existe porque a segunda sozinha aprova quem tem renda alta
 * e já gastou tudo em coisas que não são despesa fixa.
 *
 * O limite do cartão vem junto no resultado, mas de propósito NÃO reprova: as
 * duas réguas acima são sobre o orçamento, e "o banco recusaria" é uma
 * pergunta diferente. A tela mostra o número e deixa a leitura com quem decide.
 *
 * Como em period.ts e forecast.ts, tudo é função pura com `today` injetado.
 */

import {
  boundingIncomes,
  buildCardBills,
  getCardLimitUsage,
  getNextPeriodBounds,
  getPeriodBounds,
  storedDay,
  type CardLimitUsage,
  type CardPurchaseInput,
} from "./period";
import { forecastPeriods, type ForecastInput, type PeriodForecast } from "./forecast";

/** A compra hipotética. Os mesmos campos de uma CardPurchase de verdade. */
export interface SimulatedPurchase {
  cardId: string;
  /** O TOTAL da compra, não o valor da parcela — como em CardPurchaseInput. */
  amount: number;
  date: Date;
  installments: number;
}

/**
 * A janela em que o comprometimento é medido: um mês de ciclos, e não um ciclo.
 *
 * Quem recebe uma vez por mês tem os dois iguais. Quem recebe duas vezes não:
 * o aluguel cai inteiro no ciclo que contém o dia do vencimento, enquanto esse
 * ciclo só tem metade da renda do mês. Medido por ciclo, um aluguel de 1.400
 * contra um salário de 3.000 dá 47% — e um teto de 30% reprovaria toda compra
 * para sempre, sem que nada estivesse errado com as finanças do usuário. A
 * conta honesta é 1.400 sobre os 5.000 do mês inteiro.
 */
export interface CommitmentWindow {
  start: Date;
  end: Date;
  /** A renda da janela. Não muda com a compra — cartão não mexe em receita. */
  income: number;
  committedBefore: number;
  committedAfter: number;
  /**
   * (despesas fixas + faturas) / renda, de 0 a 1, para a tela exibir. As
   * comparações com o teto são feitas em DINHEIRO, não nesta razão: um centavo
   * sobre uma renda de R$ 5.000 mexe na sétima casa decimal, e qualquer
   * tolerância grande o bastante para absorver erro de ponto flutuante
   * engoliria junto uma compra que de fato passa do teto.
   */
  before: number | null;
  after: number | null;
}

/** O que a compra faz com um período, lado a lado com o que ele seria sem ela. */
export interface PeriodImpact {
  offset: number;
  periodStart: Date;
  periodEnd: Date;
  /**
   * Quanto das parcelas cai neste período. Zero num ciclo sem vencimento de
   * fatura, que entra na lista porque o saldo dele também cai: carrega as
   * parcelas dos ciclos anteriores.
   */
  installmentAmount: number;
  /** Quantas parcelas caem aqui — normalmente uma, mas ciclos curtos variam. */
  installmentCount: number;
  /** O saldo com que o ciclo fecha — encadeado, com a herança dos anteriores. */
  balanceBefore: number;
  balanceAfter: number;
  /**
   * A sobra por dia, que é o número que a Home mostra. Vem junto porque a
   * régua da sobra aprova um ciclo que fecha em R$ 0,01, e `balance` não
   * reserva um centavo para mercado, transporte ou qualquer gasto variável —
   * a própria tela de Previsão diz isso. Ver o dia a dia encolher de R$ 41
   * para R$ 3 é o que impede um SIM tecnicamente correto de enganar.
   */
  dailyBefore: number;
  dailyAfter: number;
  /** A janela mensal em que o teto é medido. Ver CommitmentWindow. */
  commitment: CommitmentWindow;
  /** Este ciclo já reprovava antes da compra — o NÃO não é culpa dela. */
  alreadyFailing: boolean;
}

export type SimulationBlocker = "negativeBalance" | "overCommitment" | "noIncome";

export interface PurchaseSimulation {
  approved: boolean;
  /** Vazio quando aprovada. Na ordem em que a tela os explica. */
  blockers: SimulationBlocker[];
  /** O valor da primeira parcela, que é o que `installmentLabel` anuncia. */
  installmentAmount: number;
  /** O vencimento da fatura que cobra a primeira parcela. */
  firstDueDate: Date | null;
  lastDueDate: Date | null;
  /**
   * Os períodos da primeira parcela em diante, em ordem de deslocamento — os
   * que a compra mexe no saldo.
   */
  periods: PeriodImpact[];
  /** O período que mais aperta — o que a tela destaca ao justificar o veredito. */
  worstPeriod: PeriodImpact | null;
  /**
   * Algum ciclo tocado já estouraria uma das réguas mesmo sem esta compra.
   * A tela precisa dizer isso com outras palavras: culpar a compra por um mês
   * que já estava no vermelho manda o usuário consertar a coisa errada.
   */
  alreadyFailing: boolean;
  limitUsage: CardLimitUsage | null;
  /** O maior total que passaria mantendo o mesmo número de parcelas. */
  maxAffordableAmount: number;
  /**
   * O menor número de parcelas que faria este total passar. `null` quando a
   * compra já foi aprovada, ou quando nem parcelar resolve.
   */
  minInstallments: number | null;
  /**
   * Quanto da compra ficou fora da análise: parcelas além do horizonte
   * projetado, ou que cairiam numa fatura já paga. Maior que zero significa
   * que o veredito não cobre a compra inteira, e a tela precisa dizer isso —
   * um SIM que ignorou metade da dívida em silêncio é pior que nenhum.
   */
  unevaluatedAmount: number;
  /** O fim do horizonte projetado, quando as parcelas passam dele. */
  truncatedAfter: Date | null;
}

/**
 * O cartão da previsão acrescido do limite, que só esta simulação usa. Continua
 * sendo um superset de CreditCardInput, então o mesmo objeto serve aos três
 * módulos sem conversão.
 */
export type SimulationCreditCardInput = ForecastInput["creditCards"][number] & {
  creditLimit?: number;
};

export type SimulatePurchaseInput = Omit<ForecastInput, "creditCards"> & {
  creditCards: SimulationCreditCardInput[];
  purchase: SimulatedPurchase;
  /** De 1 a 100. */
  commitmentLimitPercent: number;
};

/**
 * O padrão de quem nunca mexeu na configuração: 70% comprometido, ou seja, 30%
 * da renda continuam livres depois de as despesas fixas e as faturas saírem.
 *
 * A régua é sobre o que SOBRA, e o teto é o complemento dela. Dito ao contrário
 * — "no máximo 30% comprometido" — a conta reprovaria todo mundo que paga
 * aluguel, porque só ele já passa disso.
 */
export const DEFAULT_COMMITMENT_LIMIT_PERCENT = 70;

/**
 * Até onde a simulação projeta. São 60 ciclos, não 60 meses: quem recebe duas
 * vezes por mês chega na metade do tempo. O número é generoso de propósito —
 * 24 parcelas com dois pagamentos mensais já são 49 ciclos, e cada ciclo a
 * mais é aritmética pura sobre algumas dezenas de fatias. Truncar barato seria
 * economizar no lugar errado: o preço não é tempo, é um veredito sobre metade
 * da dívida.
 */
export const MAX_SIMULATION_OFFSET = 60;

/** O maior parcelamento que a busca por uma alternativa chega a considerar. */
export const MAX_SIMULATION_INSTALLMENTS = 24;

/**
 * Meio centavo. Comparar dinheiro com zero em ponto flutuante transformava uma
 * sobra de exatamente R$ 0,00 num NÃO por 1e-13.
 */
const EPSILON = 0.005;

/** Duas casas, para o acúmulo de frações não virar um centavo fantasma. */
function toCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeInstallments(installments: number): number {
  if (!Number.isInteger(installments) || installments < 1) return 1;
  return installments;
}

/**
 * Quantos ciclos formam um mês para este usuário. É quantos dias de pagamento
 * distintos ele tem: dois salários em dias diferentes partem o mês em dois.
 */
function periodsPerMonth(input: SimulatePurchaseInput): number {
  return Math.max(
    1,
    new Set(boundingIncomes(input.incomes).map((income) => income.dayOfMonth)).size,
  );
}

/**
 * Os vencimentos que cobram esta compra, e quanto cada um cobra.
 *
 * Sai de `buildCardBills` sobre a compra sozinha: as faturas vazias da janela
 * são descartadas, então o que resta é uma fatura por parcela. Fazer a conta
 * aqui em vez de inferi-la da diferença entre as duas projeções é o que dá as
 * datas exatas de primeira e última cobrança, que a diferença não teria.
 */
function installmentBills(
  purchase: CardPurchaseInput,
  card: SimulationCreditCardInput,
  installments: number,
): { dueDate: Date; amount: number }[] {
  return buildCardBills({
    card,
    purchases: [purchase],
    // A janela começa no dia da compra e sobra alguns vencimentos: se o
    // vencimento do cartão vem antes do fechamento, a primeira fatura da série
    // é a do ciclo anterior, que esta compra não toca e que sai zerada.
    from: storedDay(purchase.date),
    months: installments + 3,
  })
    .filter((bill) => bill.amount > 0)
    .map((bill) => ({ dueDate: bill.dueDate, amount: bill.amount }));
}

/**
 * Quantos períodos projetar para alcançar a última parcela, e se o teto cortou
 * antes disso.
 *
 * Contar os ciclos aqui, com a mesma `getNextPeriodBounds` que a projeção usa,
 * é o que evita traduzir parcelas em meses e meses em períodos: quem recebe
 * quinzenalmente tem dois períodos por mês, e um palpite erraria por um fator
 * de dois.
 */
function offsetReaching(
  input: SimulatePurchaseInput,
  lastDueDate: Date,
): { offset: number; truncatedAfter: Date | null } {
  let bounds = getPeriodBounds(input.incomes, input.today, input.incomeReceipts);
  let offset = 0;

  while (bounds.periodEnd.getTime() <= lastDueDate.getTime()) {
    if (offset >= MAX_SIMULATION_OFFSET) {
      return { offset, truncatedAfter: bounds.periodEnd };
    }
    bounds = getNextPeriodBounds(input.incomes, bounds.periodEnd, input.incomeReceipts);
    offset++;
  }

  return { offset, truncatedAfter: null };
}

/** Os índices da janela mensal que contém o período de índice `index`. */
function windowRange(index: number, size: number, length: number): [number, number] {
  const start = index - (index % size);
  return [start, Math.min(start + size, length)];
}

/** A soma de uma janela de períodos, que é onde o comprometimento é medido. */
function windowTotals(periods: PeriodForecast[], from: number, to: number) {
  const slice = periods.slice(from, to);
  const sum = (pick: (p: PeriodForecast) => number) =>
    slice.reduce((total, period) => total + pick(period), 0);

  return {
    start: slice[0].periodStart,
    end: slice[slice.length - 1].periodEnd,
    // A renda esperada, e não só a confirmada: o teto mede o peso das contas
    // sobre o que se ganha, e dobraria só porque o salário de hoje ainda não
    // foi marcado como recebido.
    income: sum((p) => p.expectedIncomeTotal),
    committed: sum((p) => p.fixedExpenseTotal + p.cardBillTotal),
  };
}

function ratioOf(committed: number, income: number): number | null {
  if (income <= 0) return null;
  return committed / income;
}

/**
 * Se o comprometido passa do teto, comparado em dinheiro e com meio centavo de
 * folga. Uma janela sem renda nunca passa: não há porcentagem de zero, e a
 * régua da sobra já pega o ciclo que gasta sem receber.
 */
function exceedsLimit(income: number, committed: number, limit: number): boolean {
  if (income <= 0) return false;
  return committed > income * limit + EPSILON;
}

interface Comparison {
  core: Omit<PurchaseSimulation, "maxAffordableAmount" | "minInstallments">;
  /**
   * O maior valor de parcela que ainda passaria, visto de cada restrição
   * separadamente. O mínimo da lista é o que a sugestão usa.
   */
  slackPerInstallment: number[];
}

/**
 * O núcleo: projeta com e sem a compra e compara, sem sugerir alternativa
 * nenhuma. Separado de `simulatePurchase` porque a busca por uma alternativa
 * precisa simular de novo, e uma recursão que também buscasse alternativa não
 * terminaria.
 */
function compare(input: SimulatePurchaseInput): Comparison {
  const installments = normalizeInstallments(input.purchase.installments);
  const limit = input.commitmentLimitPercent / 100;

  const card = input.creditCards.find((c) => c.id === input.purchase.cardId);
  if (!card) {
    throw new Error(`Cartão ${input.purchase.cardId} não está entre os cartões da simulação`);
  }

  const purchaseInput: CardPurchaseInput = {
    cardId: input.purchase.cardId,
    amount: input.purchase.amount,
    date: input.purchase.date,
    installments,
  };

  const bills = installmentBills(purchaseInput, card, installments);
  const firstDueDate = bills.at(0)?.dueDate ?? null;
  const lastDueDate = bills.at(-1)?.dueDate ?? null;
  const installmentAmount = bills.at(0)?.amount ?? 0;

  const limitUsage = getCardLimitUsage({
    card,
    purchases: input.cardPurchases,
    cardFixedExpenses: input.fixedExpenses.filter((e) => e.cardId === card.id),
    billEstimates: input.billEstimates,
    expensePayments: input.expensePayments,
    today: input.today,
  });

  const unanswerable: Comparison = {
    core: {
      approved: false,
      blockers: ["noIncome"],
      installmentAmount,
      firstDueDate,
      lastDueDate,
      periods: [],
      worstPeriod: null,
      alreadyFailing: false,
      limitUsage,
      unevaluatedAmount: input.purchase.amount,
      truncatedAfter: null,
    },
    slackPerInstallment: [],
  };

  // Sem renda não há ciclo, e `forecastPeriods` devolve lista vazia. Dar um SIM
  // aqui seria aprovar a compra sobre uma projeção que não existe.
  if (boundingIncomes(input.incomes).length === 0 || lastDueDate === null) return unanswerable;

  const monthSize = periodsPerMonth(input);
  const { offset, truncatedAfter } = offsetReaching(input, lastDueDate);
  // A última janela mensal precisa fechar: cortar no meio dela contaria as
  // faturas do mês inteiro contra metade da renda e inflaria o comprometimento.
  // E vai um mês além da última parcela: o saldo é encadeado, então a compra
  // continua pesando depois de paga, e um mês apertado logo em seguida é
  // justamente onde ela ainda pode faltar.
  const count = Math.min(
    MAX_SIMULATION_OFFSET,
    offset - (offset % monthSize) + 2 * monthSize - 1,
  );

  const before = forecastPeriods({ ...input, count, maxOffset: MAX_SIMULATION_OFFSET });
  const after = forecastPeriods({
    ...input,
    cardPurchases: [...input.cardPurchases, purchaseInput],
    count,
    maxOffset: MAX_SIMULATION_OFFSET,
  });

  if (before.length === 0) return unanswerable;

  const periods: PeriodImpact[] = [];
  const balanceSlack: number[] = [];
  /** Uma entrada por janela mensal tocada, somando as parcelas que caem nela. */
  const windowSlack = new Map<number, { room: number; installments: number }>();
  let evaluatedAmount = 0;
  const horizonStart = before[0].periodStart.getTime();
  let reached = false;

  for (const [index, baseline] of before.entries()) {
    const simulated = after[index];
    // A diferença entre as faturas das duas projeções é o que a compra
    // adicionou a este ciclo — e só ela, porque o resto é idêntico nas duas.
    const added = toCents(simulated.cardBillTotal - baseline.cardBillTotal);
    const touched = added > 0;
    // Antes da primeira parcela nada muda. Dali em diante todo ciclo muda,
    // tocado ou não: o saldo encadeado carrega as parcelas já cobradas.
    if (touched) reached = true;
    if (!reached) continue;

    if (touched) evaluatedAmount += added;

    // Quantas parcelas caem aqui: normalmente uma, mas um ciclo longo pode
    // pegar duas faturas, e dividir a folga pelo número errado sugeriria um
    // valor que não cabe.
    const installmentCount = bills.filter(
      (bill) =>
        bill.dueDate.getTime() >= baseline.periodStart.getTime() &&
        bill.dueDate.getTime() < baseline.periodEnd.getTime(),
    ).length;
    // E quantas já caíram até o fim deste ciclo: é o que o saldo dele carrega.
    const cumulativeCount = bills.filter(
      (bill) =>
        bill.dueDate.getTime() >= horizonStart &&
        bill.dueDate.getTime() < baseline.periodEnd.getTime(),
    ).length;

    const [from, to] = windowRange(index, monthSize, before.length);
    const windowBefore = windowTotals(before, from, to);
    const windowAfter = windowTotals(after, from, to);

    const commitment: CommitmentWindow = {
      start: windowBefore.start,
      end: windowBefore.end,
      income: windowBefore.income,
      committedBefore: windowBefore.committed,
      committedAfter: windowAfter.committed,
      before: ratioOf(windowBefore.committed, windowBefore.income),
      after: ratioOf(windowAfter.committed, windowAfter.income),
    };

    const failsBalanceBefore = baseline.balance < -EPSILON;
    // O teto só é cobrado das janelas em que cai parcela: numa janela que a
    // compra não toca, o comprometimento é o mesmo com ou sem ela.
    const failsCommitmentBefore =
      touched && exceedsLimit(commitment.income, commitment.committedBefore, limit);

    periods.push({
      offset: baseline.offset,
      periodStart: baseline.periodStart,
      periodEnd: baseline.periodEnd,
      installmentAmount: touched ? added : 0,
      installmentCount,
      balanceBefore: baseline.balance,
      balanceAfter: simulated.balance,
      dailyBefore: baseline.dailyAvailable,
      dailyAfter: simulated.dailyAvailable,
      commitment,
      alreadyFailing: failsBalanceBefore || failsCommitmentBefore,
    });

    /**
     * Quanto de parcela ainda caberia. As duas réguas são lineares no valor da
     * parcela e o baseline não muda quando a compra encolhe, então estas folgas
     * são exatas — não precisam de busca binária, que rodaria a projeção
     * inteira dezenas de vezes para chegar no mesmo número.
     *
     * A do saldo divide pelas parcelas acumuladas até aqui, não só pelas deste
     * ciclo: é o total delas que o saldo encadeado carrega.
     */
    if (cumulativeCount > 0) {
      balanceSlack.push(Math.max(0, baseline.balance) / cumulativeCount);
    }

    if (!touched) continue;

    // O teto é medido na janela, então a folga dele também é: duas parcelas no
    // mesmo mês dividem a mesma folga, mesmo caindo em ciclos diferentes.
    const room =
      windowBefore.income > 0
        ? Math.max(0, windowBefore.income * limit - windowBefore.committed)
        : Infinity;
    const entry = windowSlack.get(from) ?? { room, installments: 0 };
    entry.installments += installmentCount;
    windowSlack.set(from, entry);
  }

  // Os ciclos depois da última parcela são checados, mas só aparecem na tela
  // quando a compra os deixa no vermelho — do contrário são só a mesma
  // parcela repetida no saldo, e alongariam a lista sem dizer nada novo.
  const lastShown = periods.reduce(
    (last, period, index) =>
      period.installmentAmount > 0 || period.balanceAfter < -EPSILON ? index : last,
    -1,
  );
  const checkedPeriods = [...periods];
  periods.splice(lastShown + 1);

  const slackPerInstallment = [
    ...balanceSlack,
    ...[...windowSlack.values()].map((w) => w.room / Math.max(1, w.installments)),
  ];

  const blockers: SimulationBlocker[] = [];
  if (checkedPeriods.some((p) => p.balanceAfter < -EPSILON)) blockers.push("negativeBalance");
  if (
    periods.some(
      (p) =>
        p.installmentAmount > 0 &&
        exceedsLimit(p.commitment.income, p.commitment.committedAfter, limit),
    )
  ) {
    blockers.push("overCommitment");
  }

  /**
   * O gargalo é o ciclo que fica mais perto de estourar, medido pela folga que
   * sobra depois da compra. Ordenar por sobra bruta escolheria o mês mais
   * pobre mesmo quando quem estoura o teto é outro.
   */
  const slackAfter = (p: PeriodImpact) =>
    Math.min(p.balanceAfter, p.commitment.after === null ? Infinity : limit - p.commitment.after);
  const worstPeriod =
    periods.length === 0
      ? null
      : periods.reduce((worst, period) => (slackAfter(period) < slackAfter(worst) ? period : worst));

  const unevaluatedAmount = Math.max(0, toCents(input.purchase.amount - evaluatedAmount));

  return {
    core: {
      // Uma compra que a projeção não cobriu inteira não recebe um SIM: o que
      // sobrou de fora pode ser exatamente o que quebraria o mês.
      approved: blockers.length === 0 && unevaluatedAmount <= EPSILON,
      blockers,
      installmentAmount,
      firstDueDate,
      lastDueDate,
      periods,
      worstPeriod,
      alreadyFailing: periods.some((p) => p.alreadyFailing),
      limitUsage,
      unevaluatedAmount,
      truncatedAfter,
    },
    slackPerInstallment,
  };
}

/** O veredito completo, com o que caberia quando ele é negativo. */
export function simulatePurchase(input: SimulatePurchaseInput): PurchaseSimulation {
  const { core, slackPerInstallment } = compare(input);
  const installments = normalizeInstallments(input.purchase.installments);

  if (core.approved) {
    return { ...core, maxAffordableAmount: input.purchase.amount, minInstallments: null };
  }

  const maxInstallment = slackPerInstallment.length === 0 ? 0 : Math.min(...slackPerInstallment);
  // Arredondado para baixo: um centavo a mais já não passaria, e sugerir um
  // valor que a própria simulação recusaria seria pior que não sugerir nada.
  const maxAffordableAmount = Math.max(0, Math.floor(maxInstallment * installments * 100) / 100);

  return {
    ...core,
    maxAffordableAmount,
    minInstallments: findMinInstallments(input, maxInstallment),
  };
}

/**
 * O menor parcelamento que faz o mesmo total passar.
 *
 * O candidato sai da folga já calculada, mas não é confiável sozinho, e por um
 * motivo que também descarta a busca binária: passar NÃO é monótono no número
 * de parcelas. Espalhar a compra empurra parcelas para ciclos mais à frente,
 * que podem ser mais apertados por conta própria. Por isso o candidato é
 * verificado de verdade, e sobe de um em um a partir dali.
 */
function findMinInstallments(input: SimulatePurchaseInput, maxInstallment: number): number | null {
  if (maxInstallment < EPSILON) return null;

  const current = normalizeInstallments(input.purchase.installments);
  const candidate = Math.ceil(input.purchase.amount / maxInstallment);

  for (
    let installments = Math.max(current + 1, candidate);
    installments <= MAX_SIMULATION_INSTALLMENTS;
    installments++
  ) {
    if (compare({ ...input, purchase: { ...input.purchase, installments } }).core.approved) {
      return installments;
    }
  }

  return null;
}
