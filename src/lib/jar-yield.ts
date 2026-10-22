/**
 * Quanto uma caixinha que rende uma porcentagem do CDI devolve numa data: o
 * rendimento bruto, o IOF e o IR que saem dele, e o que fica. Puro e testado.
 *
 * - O CDI rende por dia útil: a taxa anual vira diária na base de 252 dias
 *   úteis, e "110% do CDI" multiplica a taxa diária.
 * - IOF: resgate antes de 30 dias corridos paga uma parte do rendimento, de
 *   96% (1 dia) a 3% (29 dias). Numa semana, ele leva quase tudo — e é por
 *   isso que a conta tem de mostrar o líquido, e não o bruto.
 * - IR: 22,5% até 180 dias, 20% até 360, 17,5% até 720, 15% depois — sobre o
 *   rendimento já sem o IOF.
 */

/** IOF regressivo, em % do rendimento, pelo dia corrido do resgate (1 a 29). */
const IOF_TABLE = [
  96, 93, 90, 86, 83, 80, 76, 73, 70, 66, 63, 60, 56, 53, 50, 46, 43, 40, 36, 33, 30, 26, 23, 20,
  16, 13, 10, 6, 3,
];

export function iofRate(calendarDays: number): number {
  if (calendarDays < 1) return 1;
  if (calendarDays >= 30) return 0;
  return IOF_TABLE[calendarDays - 1] / 100;
}

export function irRate(calendarDays: number): number {
  if (calendarDays <= 180) return 0.225;
  if (calendarDays <= 360) return 0.2;
  if (calendarDays <= 720) return 0.175;
  return 0.15;
}

const DAY = 86_400_000;

/** O domingo de Páscoa (algoritmo de Meeus), como meia-noite UTC. */
function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const holidayCache = new Map<number, Set<number>>();

/**
 * Os feriados nacionais em que o CDI não rende: os fixos, mais carnaval,
 * Sexta-feira Santa e Corpus Christi, que andam com a Páscoa.
 */
function holidays(year: number): Set<number> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const fixed = [
    [0, 1],
    [3, 21],
    [4, 1],
    [8, 7],
    [9, 12],
    [10, 2],
    [10, 15],
    [10, 20],
    [11, 25],
  ].map(([m, d]) => Date.UTC(year, m, d));
  const e = easter(year).getTime();
  const moving = [-48, -47, -2, 60].map((offset) => e + offset * DAY);
  const set = new Set([...fixed, ...moving]);
  holidayCache.set(year, set);
  return set;
}

export function isBusinessDay(day: Date): boolean {
  const weekday = day.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !holidays(day.getUTCFullYear()).has(day.getTime());
}

/** Dias úteis em [from, to): o dia da aplicação rende, o do resgate não. */
export function businessDaysBetween(from: Date, to: Date): number {
  let count = 0;
  for (let t = from.getTime(); t < to.getTime(); t += DAY) {
    if (isBusinessDay(new Date(t))) count++;
  }
  return count;
}

export interface YieldResult {
  calendarDays: number;
  businessDays: number;
  /** O rendimento antes dos impostos. */
  gross: number;
  iof: number;
  ir: number;
  /** O que você ganha de verdade por ter deixado lá. */
  net: number;
  /** O que sai da caixinha no dia: o valor guardado mais o líquido. */
  total: number;
}

function cents(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * O que um valor guardado hoje devolve numa data.
 *
 * As datas são dias de calendário em meia-noite UTC, como o app guarda.
 */
export function simulateYield(input: {
  amount: number;
  /** O CDI ao ano, em % (14,9 = 14,9% a.a.). */
  cdiAnnualPercent: number;
  /** Quanto do CDI a caixinha paga, em % (100 = 100% do CDI). */
  cdiPercent: number;
  from: Date;
  to: Date;
}): YieldResult {
  const amount = Math.max(0, input.amount);
  const calendarDays = Math.max(0, Math.round((input.to.getTime() - input.from.getTime()) / DAY));
  const businessDays = businessDaysBetween(input.from, input.to);
  const dailyCdi = Math.pow(1 + Math.max(0, input.cdiAnnualPercent) / 100, 1 / 252) - 1;
  const daily = dailyCdi * (Math.max(0, input.cdiPercent) / 100);
  const gross = cents(amount * (Math.pow(1 + daily, businessDays) - 1));
  const iof = cents(gross * iofRate(calendarDays));
  const ir = cents((gross - iof) * irRate(calendarDays));
  const net = cents(gross - iof - ir);
  return { calendarDays, businessDays, gross, iof, ir, net, total: cents(amount + net) };
}

/**
 * O CDI quando não dá para buscar o do Banco Central. Aparece na tela como
 * estimativa, num campo que a pessoa pode corrigir.
 */
export const FALLBACK_CDI_ANNUAL_PERCENT = 14.9;

export interface YieldLot {
  /** O dia em que o dinheiro entrou, meia-noite UTC. */
  from: Date;
  amount: number;
}

/**
 * O que sobra de cada entrada depois dos resgates, do mais antigo para o mais
 * novo — como os bancos tiram: primeiro o que entrou primeiro. Cada sobra rende
 * e paga imposto pela própria data.
 */
export function remainingLots(movements: { date: Date; amount: number }[]): YieldLot[] {
  const lots: YieldLot[] = [];
  const sorted = [...movements].sort((a, b) => a.date.getTime() - b.date.getTime());
  for (const m of sorted) {
    if (m.amount > 0) {
      lots.push({ from: m.date, amount: m.amount });
      continue;
    }
    let out = -m.amount;
    while (out > 0.005 && lots.length > 0) {
      const take = Math.min(out, lots[0].amount);
      lots[0].amount = cents(lots[0].amount - take);
      out = cents(out - take);
      if (lots[0].amount <= 0.005) lots.shift();
    }
  }
  return lots;
}

export interface LotsYieldResult {
  principal: number;
  gross: number;
  iof: number;
  ir: number;
  net: number;
  total: number;
  lots: (YieldLot & YieldResult)[];
}

/** O mesmo `simulateYield`, entrada por entrada, somado. */
export function simulateLotsYield(input: {
  lots: YieldLot[];
  cdiAnnualPercent: number;
  cdiPercent: number;
  to: Date;
}): LotsYieldResult {
  const lots = input.lots.map((lot) => ({
    ...lot,
    ...simulateYield({
      amount: lot.amount,
      cdiAnnualPercent: input.cdiAnnualPercent,
      cdiPercent: input.cdiPercent,
      from: lot.from,
      to: input.to,
    }),
  }));
  const sum = (pick: (l: YieldResult & YieldLot) => number) =>
    cents(lots.reduce((total, lot) => total + pick(lot), 0));
  return {
    principal: sum((l) => l.amount),
    gross: sum((l) => l.gross),
    iof: sum((l) => l.iof),
    ir: sum((l) => l.ir),
    net: sum((l) => l.net),
    total: sum((l) => l.total),
    lots,
  };
}
