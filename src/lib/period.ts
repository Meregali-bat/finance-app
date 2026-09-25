/**
 * Pure calculation module for the "how much can I spend today" budget.
 *
 * A "period" runs from one payday to the next, considering ALL active income
 * sources combined (not just one). Everything here is a pure function over
 * plain inputs so it can be unit tested without touching the database.
 */

export interface IncomeInput {
  id: string;
  amount: number;
  dayOfMonth: number;
  /** When omitted, every occurrence is treated as valid (useful for tests). */
  createdAt?: Date;
  /**
   * Desligada pelo usuário. Uma renda inativa não marca mais onde os períodos
   * começam e terminam nem é projetada, mas o que ela já pagou continua valendo:
   * os recebimentos confirmados dela seguem somando. Ausente = ativa.
   */
  active?: boolean;
}

export interface IncomeReceiptInput {
  incomeId: string;
  /** The occurrence (payday) this confirmation applies to. */
  occurrenceDate: Date;
  /** The amount actually received, which may differ from the income's registered amount. */
  amount: number;
}

export interface FixedExpenseInput {
  id: string;
  amount: number;
  /** Required when standalone (no cardId); ignored when billed on a card, since the card's own due date applies. */
  dueDay?: number;
  /** When omitted, every occurrence is treated as valid (useful for tests). */
  createdAt?: Date;
  /**
   * Quando a despesa deixou de ser cobrada — pausada ou apagada.
   *
   * Existe para o encerramento não ser retroativo: sem uma data, apagar uma
   * assinatura a fazia sumir também dos meses em que ela de fato foi cobrada,
   * e o Histórico perdia dinheiro que saiu. Ausente = ainda vigente.
   */
  endedAt?: Date;
  /** When set, this expense is billed on a credit card instead of standing alone. */
  cardId?: string;
}

export interface CreditCardInput {
  id: string;
  closingDay: number;
  dueDay: number;
}

export interface CardPurchaseInput {
  cardId: string;
  /** O TOTAL da compra, não o valor da parcela. */
  amount: number;
  date: Date;
  /** Em quantas parcelas. Ausente ou 1 = valor inteiro num único ciclo. */
  installments?: number;
}

/**
 * Confirmação de que uma ocorrência de despesa foi paga. Exatamente um entre
 * fixedExpenseId e cardId vem preenchido.
 */
/**
 * Um valor previsto que o usuário lançou à mão para a fatura de um vencimento.
 * É ADITIVO: soma ao que as compras calculam, nunca substitui.
 */
export interface CardBillEstimateInput {
  cardId: string;
  /** O vencimento da fatura em que este valor entra. */
  dueDate: Date;
  amount: number;
}

export interface ExpensePaymentInput {
  fixedExpenseId?: string;
  cardId?: string;
  /** O vencimento da ocorrência quitada — não a data em que o usuário pagou. */
  dueDate: Date;
  /** O valor realmente pago, que pode diferir da estimativa. */
  amount: number;
}

export interface TransactionInput {
  amount: number;
  date: Date;
  /**
   * Linha que o fechamento de período antigo gravava para devolver a sobra ao
   * orçamento seguinte. O saldo agora passa de um período ao outro sozinho, e
   * contar essas linhas também levaria a mesma sobra duas vezes.
   */
  fromPeriodClose?: boolean;
}

/**
 * Dinheiro guardado numa caixinha. Sai do dinheiro disponível — a caixinha é
 * outro lugar, como o saldo em conta já trata —, então pesa no período em que
 * foi feito como qualquer outra saída.
 */
export interface JarDepositInput {
  amount: number;
  /** O instante do depósito (`createdAt`), não um dia de calendário. */
  date: Date;
}

export interface CardBillReminder {
  cardId: string;
  dueDate: Date;
  amount: number;
  /** Venceu no período anterior e continua sem pagamento confirmado. */
  overdue?: boolean;
}

/** Uma fatura de um cartão: o que ela cobra, de onde vem, e se já foi paga. */
export interface CardBill {
  cardId: string;
  /** O vencimento — a identidade da fatura, a mesma de ExpensePayment. */
  dueDate: Date;
  /** O ciclo que gerou a fatura: (cycleStart, cycleEnd]. */
  cycleStart: Date;
  cycleEnd: Date;
  /** O previsto: parcelas + assinaturas do cartão + previsões manuais. */
  amount: number;
  /** De onde veio cada pedaço, para a tela poder detalhar. */
  purchaseAmount: number;
  fixedExpenseAmount: number;
  estimateAmount: number;
  paid: boolean;
  /** O valor realmente pago, quando pago — pode diferir do previsto. */
  paidAmount?: number;
}

export interface FixedExpenseReminder {
  expenseId: string;
  dueDate: Date;
  amount: number;
  /** Venceu no período anterior e continua sem pagamento confirmado. */
  overdue?: boolean;
}

export interface IncomeReminder {
  incomeId: string;
  dueDate: Date;
  amount: number;
}

export interface CardLimitUsage {
  limit: number;
  /** Tudo que ainda não foi pago: faturas em aberto + parcelas futuras. */
  used: number;
  /**
   * Nunca negativo: um estouro se mostra pela porcentagem em 100, não por um
   * número negativo de "disponível", que não é uma quantia que exista.
   */
  available: number;
  /** 0..100, arredondado e limitado, pronto para a barra de progresso. */
  percentUsed: number;
  /** Faturas com vencimento já passado e ainda sem pagamento confirmado. */
  overdueBillCount: number;
}

/**
 * De onde veio o saldo com que o período abriu.
 *
 * - `account`: do saldo em conta que o usuário informou. É o dinheiro real, e
 *   por isso manda quando existe.
 * - `history`: dos períodos anteriores encadeados, a partir do primeiro que o
 *   app acompanhou — sem saber o que havia no banco antes dele.
 */
export type OpeningSource = "account" | "history";

export interface PeriodBudget {
  periodStart: Date;
  periodEnd: Date;
  daysRemaining: number;
  /**
   * O que o período herdou do anterior: a sobra, ou o que faltou, com sinal.
   * `periodBalance` já o inclui.
   */
  openingBalance: number;
  openingSource: OpeningSource;
  incomeTotal: number;
  fixedExpenseTotal: number;
  cardBillTotal: number;
  transactionTotal: number;
  /** Guardado em caixinhas durante o período. */
  jarDepositTotal: number;
  /** Só o que aconteceu no período: renda menos todas as saídas, sem a herança. */
  periodResult: number;
  /** O saldo com que o período termina: `openingBalance + periodResult`. */
  periodBalance: number;
  dailyAvailable: number;
  cardBillReminders: CardBillReminder[];
  fixedExpenseReminders: FixedExpenseReminder[];
  incomeReminders: IncomeReminder[];
}

/** O dia de um instante real — agora, ou quando um registro foi criado. */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * O dia de uma data que o banco guarda como dia de calendário: vencimento,
 * ocorrência de recebimento, data de lançamento.
 *
 * Elas são gravadas como meia-noite do fuso de quem gravou, então o dia
 * pretendido está na parte **UTC** do valor — e não na parte local, que
 * depende de quem está lendo. Um vencimento no dia 10 aparece como
 * `2026-08-10 00:00` nas linhas gravadas por um servidor em UTC e como
 * `2026-08-10 03:00` nas gravadas em horário de Brasília; lidas em UTC as
 * duas dizem dia 10, e é isso que faz uma confirmação continuar casando com
 * a ocorrência calculada mesmo que o servidor mude de fuso.
 *
 * O retorno é meia-noite local, a mesma forma que `dateForDayInMonth`
 * produz, para os dois lados da comparação falarem a mesma língua.
 */
export function storedDay(date: Date): Date {
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * O lançamento cai no dia de `reference`?
 *
 * Os dois lados falam línguas diferentes e é por isso que esta função existe:
 * `date` é um dia de calendário, cuja intenção mora na parte UTC, e
 * `reference` é um instante de verdade — hoje, amanhã —, que se lê no fuso
 * local. Comparar os dois com a mesma leitura erra por um dia em fuso
 * negativo, que era o que fazia "Movimentações de hoje" listar as de amanhã.
 */
export function fallsOnDay(date: Date, reference: Date): boolean {
  return storedDay(date).getTime() === startOfDay(reference).getTime();
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Clamps a day-of-month (1-31) to a real date, e.g. 31 in February -> Feb 28/29. */
function dateForDayInMonth(year: number, month: number, day: number): Date {
  const clampedDay = Math.min(day, daysInMonth(year, month));
  return new Date(year, month, clampedDay);
}

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/** Latest occurrence of dayOfMonth that is <= reference. */
function latestOccurrenceOnOrBefore(dayOfMonth: number, reference: Date): Date {
  const ref = startOfDay(reference);
  const candidate = dateForDayInMonth(ref.getFullYear(), ref.getMonth(), dayOfMonth);
  if (candidate.getTime() <= ref.getTime()) return candidate;
  const prev = addMonths(ref.getFullYear(), ref.getMonth(), -1);
  return dateForDayInMonth(prev.year, prev.month, dayOfMonth);
}

/** Earliest occurrence of dayOfMonth that is strictly after reference. */
function earliestOccurrenceAfter(dayOfMonth: number, reference: Date): Date {
  const ref = startOfDay(reference);
  const candidate = dateForDayInMonth(ref.getFullYear(), ref.getMonth(), dayOfMonth);
  if (candidate.getTime() > ref.getTime()) return candidate;
  const next = addMonths(ref.getFullYear(), ref.getMonth(), 1);
  return dateForDayInMonth(next.year, next.month, dayOfMonth);
}

/** A primeira ocorrência de dayOfMonth em ou depois de reference. */
function earliestOccurrenceOnOrAfter(dayOfMonth: number, reference: Date): Date {
  const ref = startOfDay(reference);
  const candidate = dateForDayInMonth(ref.getFullYear(), ref.getMonth(), dayOfMonth);
  if (candidate.getTime() >= ref.getTime()) return candidate;
  const next = addMonths(ref.getFullYear(), ref.getMonth(), 1);
  return dateForDayInMonth(next.year, next.month, dayOfMonth);
}

/** Latest occurrence of dayOfMonth strictly before reference. */
function latestOccurrenceBefore(dayOfMonth: number, reference: Date): Date {
  const ref = startOfDay(reference);
  const candidate = dateForDayInMonth(ref.getFullYear(), ref.getMonth(), dayOfMonth);
  if (candidate.getTime() < ref.getTime()) return candidate;
  const prev = addMonths(ref.getFullYear(), ref.getMonth(), -1);
  return dateForDayInMonth(prev.year, prev.month, dayOfMonth);
}

/**
 * All occurrences of dayOfMonth within [start, end).
 *
 * A varredura cobre três meses a partir do mês anterior a `start`, o que a
 * limita a intervalos de pouco menos de dois meses — um período de pagamento
 * cabe folgado, mas uma janela maior perderia ocorrências silenciosamente.
 */
export function occurrencesInRange(dayOfMonth: number, start: Date, end: Date): Date[] {
  const occurrences: Date[] = [];
  let cursor = addMonths(start.getFullYear(), start.getMonth(), -1);
  for (let i = 0; i < 3; i++) {
    const d = dateForDayInMonth(cursor.year, cursor.month, dayOfMonth);
    if (d.getTime() >= start.getTime() && d.getTime() < end.getTime()) {
      occurrences.push(d);
    }
    cursor = addMonths(cursor.year, cursor.month, 1);
  }
  return occurrences;
}

function diffCalendarDays(a: Date, b: Date): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / MS_PER_DAY);
}

/**
 * An occurrence only "counts" if it happened on or after the record was
 * created — otherwise a freshly-added income/expense would retroactively
 * invent a past payday/due date that was never actually tracked.
 */
export function isOccurrenceValid(occurrence: Date, createdAt: Date | undefined): boolean {
  if (!createdAt) return true;
  return occurrence.getTime() >= startOfDay(createdAt).getTime();
}

/**
 * A ocorrência de uma despesa cai dentro da vigência dela?
 *
 * A janela é fechada nas duas pontas. Do lado de baixo pelo mesmo motivo de
 * `isOccurrenceValid`; do lado de cima porque o ciclo que fecha no próprio dia
 * do encerramento cobre o mês inteiro em que a despesa esteve ativa — cortá-lo
 * daria de graça um mês que foi usado.
 */
export function isExpenseOccurrenceValid(
  occurrence: Date,
  expense: { createdAt?: Date; endedAt?: Date },
): boolean {
  if (!isOccurrenceValid(occurrence, expense.createdAt)) return false;
  if (!expense.endedAt) return true;
  return occurrence.getTime() <= startOfDay(expense.endedAt).getTime();
}

/**
 * How far back before an income's registration a payday can sit and still be
 * worth asking about. A payday from the days just before the user set the
 * income up is very likely the money they're living on right now; anything
 * older belongs to a stretch the app never tracked.
 */
const PRE_REGISTRATION_GRACE_DAYS = 7;

/** Whether a payday is recent enough to be worth asking the user about. */
function isPaydayAskable(occurrence: Date, createdAt: Date | undefined): boolean {
  if (!createdAt || isOccurrenceValid(occurrence, createdAt)) return true;
  return diffCalendarDays(startOfDay(createdAt), occurrence) <= PRE_REGISTRATION_GRACE_DAYS;
}

/** Whether the user has confirmed receiving a specific payday. */
function isPaydayConfirmed(
  receipts: IncomeReceiptInput[],
  incomeId: string,
  occurrence: Date,
): boolean {
  return receipts.some(
    (r) => r.incomeId === incomeId && storedDay(r.occurrenceDate).getTime() === occurrence.getTime(),
  );
}

/**
 * O pagamento que quita uma ocorrência, se houver. A chave é o par
 * (de quem é a despesa, qual vencimento) — comparar só por data quitaria a
 * ocorrência errada quando duas despesas vencem no mesmo dia.
 */
export function findExpensePayment(
  payments: ExpensePaymentInput[],
  key: { fixedExpenseId?: string; cardId?: string },
  dueDate: Date,
): ExpensePaymentInput | undefined {
  const day = storedDay(dueDate).getTime();
  return payments.find(
    (p) =>
      p.fixedExpenseId === key.fixedExpenseId &&
      p.cardId === key.cardId &&
      storedDay(p.dueDate).getTime() === day,
  );
}

/** Só as rendas ativas marcam onde um período começa e termina. */
export function boundingIncomes<T extends IncomeInput>(incomes: T[]): T[] {
  return incomes.filter((income) => income.active !== false);
}

/**
 * The current period's boundaries, derived from every active income's
 * recurring day-of-month. periodStart is the most recent payday across all
 * sources; periodEnd is the soonest upcoming one (exclusive). If no income
 * has a usable past occurrence yet (e.g. a brand-new income whose first
 * payday hasn't happened), periodStart falls back to today.
 *
 * A payday that predates its income's creation is normally ignored, so that
 * registering an income doesn't retroactively invent a period that was never
 * tracked. Confirming it lifts that restriction: the user saying the money
 * arrived is first-hand evidence, not an invention.
 *
 * Rendas desativadas (`active: false`) ficam de fora: elas não pagam mais, e
 * deixá-las cortar o mês produziria períodos que não existem.
 */
export function getPeriodBounds(
  incomes: IncomeInput[],
  today: Date,
  incomeReceipts: IncomeReceiptInput[] = [],
): {
  periodStart: Date;
  periodEnd: Date;
} {
  const { periodStart, periodEnd } = getPeriodBoundsDetailed(incomes, today, incomeReceipts);
  return { periodStart, periodEnd };
}

/**
 * `getPeriodBounds` dizendo também se o início é um dia de pagamento de verdade
 * ou o "hoje" de reserva — o que acontece antes do primeiro pagamento que o app
 * acompanhou. O encadeamento de saldos precisa saber disso para parar ali.
 */
export function getPeriodBoundsDetailed(
  incomes: IncomeInput[],
  today: Date,
  incomeReceipts: IncomeReceiptInput[] = [],
): {
  periodStart: Date;
  periodEnd: Date;
  /** O início é o próprio `today`, e não um dia de pagamento. */
  fallback: boolean;
} {
  const active = boundingIncomes(incomes);
  if (active.length === 0) {
    const start = startOfDay(today);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { periodStart: start, periodEnd: end, fallback: true };
  }

  const futureOccurrences = active.map((inc) => earliestOccurrenceAfter(inc.dayOfMonth, today));
  const validPastOccurrences = active
    .map((inc) => ({ income: inc, occurrence: latestOccurrenceOnOrBefore(inc.dayOfMonth, today) }))
    .filter(
      ({ income, occurrence }) =>
        isOccurrenceValid(occurrence, income.createdAt) ||
        isPaydayConfirmed(incomeReceipts, income.id, occurrence),
    )
    .map(({ occurrence }) => occurrence);

  const fallback = validPastOccurrences.length === 0;
  const periodStart = fallback
    ? startOfDay(today)
    : new Date(Math.max(...validPastOccurrences.map((d) => d.getTime())));
  const periodEnd = new Date(Math.min(...futureOccurrences.map((d) => d.getTime())));

  return { periodStart, periodEnd, fallback };
}

/** Sem um parcelamento válido, é uma parcela. Puro: não lança. */
function normalizeInstallments(installments: number | undefined): number {
  if (installments == null || !Number.isInteger(installments) || installments < 1) return 1;
  return installments;
}

/**
 * As parcelas de uma compra, uma por ciclo, a partir do primeiro fechamento em
 * ou depois do dia da compra.
 *
 * O ciclo de cada parcela é re-derivado de (ano, mês, closingDay) a cada passo,
 * nunca somando um mês ao ciclo anterior: com fechamento no dia 31, fevereiro
 * gruda em 28, e somar um mês a esse 28 daria 28/mar em vez de 31/mar — o erro
 * seguiria acumulando mês a mês.
 *
 * A sobra dos centavos vai toda para a primeira parcela: é o que os bancos
 * fazem, e deixa a fatura mais próxima ser a pessimista, o que é o lado certo
 * de errar quando o dinheiro sai neste mês.
 *
 * Exportada para ser testada direto — é onde vivem o arredondamento e o clamp
 * do dia 31, e verificá-los através de seis chamadas de getCardBillsInPeriod
 * esconderia qual dos dois quebrou.
 */
export function installmentSlices(
  purchase: CardPurchaseInput,
  closingDay: number,
): { amount: number; cycleEnd: Date }[] {
  const count = normalizeInstallments(purchase.installments);
  const cents = Math.round(purchase.amount * 100);
  const base = Math.floor(cents / count);
  const remainder = cents - base * count;
  const firstClose = earliestOccurrenceOnOrAfter(closingDay, storedDay(purchase.date));

  return Array.from({ length: count }, (_, i) => {
    const { year, month } = addMonths(firstClose.getFullYear(), firstClose.getMonth(), i);
    return {
      amount: (base + (i === 0 ? remainder : 0)) / 100,
      cycleEnd: dateForDayInMonth(year, month, closingDay),
    };
  });
}

/**
 * Quanto tempo uma fatura vencida continua ocupando o limite sem confirmação.
 *
 * Pagar alguns dias atrasado é normal, então zerar no vencimento liberaria o
 * limite justo quando o dinheiro ainda não saiu. Já uma fatura de meio ano atrás
 * quase certamente foi paga e só não foi marcada — mantê-la comeria o limite
 * para sempre, e quem pagaria o preço do esquecimento é o usuário.
 *
 * Mesma escolha que PRE_REGISTRATION_GRACE_DAYS faz para renda não confirmada:
 * limitar até onde vale perseguir uma confirmação, em vez de varrer a história
 * toda.
 */
const LIMIT_LOOKBACK_MONTHS = 3;

/** Quantos meses de calendário separam duas datas. */
function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

/**
 * Os próximos `months` vencimentos a partir de `from`.
 *
 * Substitui occurrencesInRange para este caso: aquele varre uma janela fixa de
 * três meses (start-1, start, start+1) e por isso não alcança uma projeção de
 * seis. Aqui a caminhada é contada, não varrida.
 *
 * O dia é re-derivado por dateForDayInMonth a cada passo pelo mesmo motivo de
 * installmentSlices: um vencimento no dia 31 gruda em 28 ao passar por
 * fevereiro, e somar um mês a esse 28 nunca mais voltaria ao 31.
 */
function dueDatesFrom(dueDay: number, from: Date, months: number): Date[] {
  const first = earliestOccurrenceOnOrAfter(dueDay, from);
  return Array.from({ length: months }, (_, i) => {
    const { year, month } = addMonths(first.getFullYear(), first.getMonth(), i);
    return dateForDayInMonth(year, month, dueDay);
  });
}

/**
 * A série de faturas de um cartão: o que cada uma cobra, de onde vem cada
 * pedaço, e se já foi paga.
 *
 * Fonte única de "quanto é a fatura que vence no dia X" — getCardBillsInPeriod
 * e getCardLimitUsage saem os dois daqui, para não existirem duas contas do
 * mesmo número que possam discordar.
 *
 * Devolve TODAS as faturas da janela, inclusive as zeradas: uma projeção que
 * pulasse os meses vazios desalinharia a linha do tempo na tela. Quem quiser
 * omitir as vazias filtra depois.
 */
/**
 * As assinaturas que a fatura de um vencimento cobra, uma a uma.
 *
 * `buildCardBills` só devolve a soma delas, que basta para o total da fatura.
 * O Histórico precisa de cada uma: uma assinatura cobrada no cartão não é uma
 * CardPurchase e não aparece em nenhuma outra tabela, então sem esta lista a
 * categoria dela nunca entrava no balde de "Por categoria" — o dinheiro saía
 * e não aparecia em lugar nenhum.
 *
 * Fonte única da regra "quem entra nesta fatura", usada pelas duas.
 */
export function cardBillFixedExpenses(input: {
  card: CreditCardInput;
  cardFixedExpenses: FixedExpenseInput[];
  /** O vencimento que identifica a fatura. */
  dueDate: Date;
}): FixedExpenseInput[] {
  const { card, cardFixedExpenses, dueDate } = input;
  // Uma despesa ligada a cartão não tem dia de vencimento próprio: ela é
  // cobrada em todo ciclo que fecha em ou depois de ela ter sido cadastrada.
  const cycleEnd = latestOccurrenceBefore(card.closingDay, storedDay(dueDate));
  return cardFixedExpenses
    .filter((exp) => exp.cardId === card.id)
    .filter((exp) => isExpenseOccurrenceValid(cycleEnd, exp));
}

export function buildCardBills(input: {
  card: CreditCardInput;
  purchases: CardPurchaseInput[];
  cardFixedExpenses?: FixedExpenseInput[];
  billEstimates?: CardBillEstimateInput[];
  expensePayments?: ExpensePaymentInput[];
  /** A série começa no primeiro vencimento em ou depois deste dia. */
  from: Date;
  /** Quantos vencimentos consecutivos devolver. */
  months: number;
}): CardBill[] {
  const {
    card,
    purchases,
    cardFixedExpenses = [],
    billEstimates = [],
    expensePayments = [],
    from,
    months,
  } = input;

  const slices = purchases
    .filter((p) => p.cardId === card.id)
    .flatMap((p) => installmentSlices(p, card.closingDay));

  return dueDatesFrom(card.dueDay, from, months).map((dueDate) => {
    const cycleEnd = latestOccurrenceBefore(card.closingDay, dueDate);
    const cycleStart = latestOccurrenceBefore(card.closingDay, cycleEnd);

    const purchaseAmount = slices
      .filter((slice) => slice.cycleEnd.getTime() === cycleEnd.getTime())
      .reduce((sum, slice) => sum + slice.amount, 0);

    const fixedExpenseAmount = cardBillFixedExpenses({
      card,
      cardFixedExpenses,
      dueDate,
    }).reduce((sum, exp) => sum + exp.amount, 0);

    // Mesma granularidade de dia de findExpensePayment: a previsão casa pelo
    // vencimento, sem se importar com a hora que o banco gravou.
    const estimateAmount = billEstimates
      .filter((e) => e.cardId === card.id)
      .filter((e) => storedDay(e.dueDate).getTime() === dueDate.getTime())
      .reduce((sum, e) => sum + e.amount, 0);

    const payment = findExpensePayment(expensePayments, { cardId: card.id }, dueDate);

    return {
      cardId: card.id,
      dueDate,
      cycleStart,
      cycleEnd,
      amount: purchaseAmount + fixedExpenseAmount + estimateAmount,
      purchaseAmount,
      fixedExpenseAmount,
      estimateAmount,
      paid: !!payment,
      paidAmount: payment?.amount,
    };
  });
}

/**
 * Aggregates the credit card bill(s) due within [periodStart, periodEnd),
 * summing purchases from the closing cycle that generated each bill.
 */
export function getCardBillsInPeriod(
  cards: CreditCardInput[],
  purchases: CardPurchaseInput[],
  periodStart: Date,
  periodEnd: Date,
  cardFixedExpenses: FixedExpenseInput[] = [],
  billEstimates: CardBillEstimateInput[] = [],
): CardBillReminder[] {
  return cards.flatMap((card) =>
    // Dois vencimentos bastam: um período vai de um pagamento ao seguinte, e a
    // série já começa no primeiro vencimento em ou depois de periodStart — não
    // existe borda de baixo para filtrar, ao contrário de occurrencesInRange.
    buildCardBills({
      card,
      purchases,
      cardFixedExpenses,
      billEstimates,
      // De propósito sem expensePayments: esta função devolve o PREVISTO. Quem
      // aplica o valor realmente pago é calculateDailyBudget, e é lá que vive a
      // invariante de a fatura paga sair do lembrete mas ficar no total.
      expensePayments: [],
      from: periodStart,
      months: 2,
    })
      .filter((bill) => bill.dueDate.getTime() < periodEnd.getTime() && bill.amount > 0)
      .map((bill) => ({ cardId: card.id, dueDate: bill.dueDate, amount: bill.amount })),
  );
}

/**
 * A série de faturas que as telas de cartão mostram: as que já venceram e
 * continuam em aberto, seguidas dos próximos `months` vencimentos.
 *
 * `buildCardBills` começa no primeiro vencimento em ou depois de `from`, e uma
 * janela que abrisse em hoje deixava a fatura vencida de fora — justo a mais
 * urgente. A tela então se contradizia: o card de limite somava o valor dela e
 * avisava "1 fatura vencida", enquanto "Próxima fatura" anunciava a do mês que
 * vem e a projeção não mostrava a atrasada em lugar nenhum.
 *
 * A vencida em aberto entra como um extra, sem comer uma das `months` à
 * frente. Quanto olhar para trás é o mesmo LIMIT_LOOKBACK_MONTHS que o limite
 * usa, e pelo mesmo motivo: perseguir uma confirmação de meio ano atrás cobra
 * do usuário o preço do esquecimento.
 */
export function buildCardBillSeries(input: {
  card: CreditCardInput;
  purchases: CardPurchaseInput[];
  cardFixedExpenses?: FixedExpenseInput[];
  billEstimates?: CardBillEstimateInput[];
  expensePayments?: ExpensePaymentInput[];
  today: Date;
  /** Quantos vencimentos à frente devolver. */
  months: number;
}): CardBill[] {
  const { today, months, ...rest } = input;

  const todayStart = startOfDay(today);
  const lookback = addMonths(
    todayStart.getFullYear(),
    todayStart.getMonth(),
    -LIMIT_LOOKBACK_MONTHS,
  );
  const from = dateForDayInMonth(lookback.year, lookback.month, todayStart.getDate());

  // O +1 cobre a folga entre a janela de meses e quantos vencimentos ela de
  // fato contém: dependendo de dueDay cair antes ou depois do dia de hoje, a
  // parte passada come um vencimento a mais.
  const bills = buildCardBills({
    ...rest,
    from,
    months: LIMIT_LOOKBACK_MONTHS + 1 + months,
  });

  const overdueOpen = bills.filter(
    (bill) => bill.dueDate.getTime() < todayStart.getTime() && !bill.paid && bill.amount > 0,
  );
  const upcoming = bills
    .filter((bill) => bill.dueDate.getTime() >= todayStart.getTime())
    .slice(0, months);

  return [...overdueOpen, ...upcoming];
}

/**
 * A próxima fatura em aberto de uma série: a primeira que ainda cobra algo e
 * ainda não foi paga.
 *
 * As duas condições contam. Sem `!paid`, uma fatura já quitada seguiria
 * anunciada como "próxima fatura" — contradizendo o selo "Paga" que a projeção
 * põe na mesma linha. Sem `amount > 0`, uma fatura de mês vazio seria anunciada
 * como se houvesse algo a pagar.
 */
export function findNextOpenBill(bills: CardBill[]): CardBill | undefined {
  return bills.find((bill) => !bill.paid && bill.amount > 0);
}

/**
 * Quanto do limite do cartão já está comprometido.
 *
 * Comprometido é tudo que ainda não foi pago: as faturas em aberto mais as
 * parcelas que ainda vão fechar. É assim que o banco faz — o limite só volta
 * quando a fatura é paga —, e é por isso que marcar uma fatura como paga é o
 * que libera limite aqui.
 *
 * Devolve null quando o cartão não tem limite informado, para a tela ter uma
 * coisa só para checar em vez de adivinhar a partir de um zero.
 */
export function getCardLimitUsage(input: {
  card: CreditCardInput & { creditLimit?: number };
  purchases: CardPurchaseInput[];
  cardFixedExpenses?: FixedExpenseInput[];
  billEstimates?: CardBillEstimateInput[];
  expensePayments?: ExpensePaymentInput[];
  today: Date;
}): CardLimitUsage | null {
  const {
    card,
    purchases,
    cardFixedExpenses = [],
    billEstimates = [],
    expensePayments = [],
    today,
  } = input;

  const limit = card.creditLimit;
  if (limit == null || limit <= 0) return null;

  const todayStart = startOfDay(today);
  const lookback = addMonths(
    todayStart.getFullYear(),
    todayStart.getMonth(),
    -LIMIT_LOOKBACK_MONTHS,
  );
  const from = dateForDayInMonth(lookback.year, lookback.month, todayStart.getDate());

  // O horizonte para frente é derivado, não fixo: vai até a última parcela e a
  // última previsão que existirem, para um 18x ser coberto inteiro sem varrer
  // uma janela fixa grande o suficiente para qualquer caso. O +2 cobre a
  // distância entre um ciclo fechar e a fatura que o cobra vencer.
  const slices = purchases
    .filter((p) => p.cardId === card.id)
    .flatMap((p) => installmentSlices(p, card.closingDay));
  const lastRelevant = [
    ...slices.map((slice) => slice.cycleEnd),
    ...billEstimates.filter((e) => e.cardId === card.id).map((e) => storedDay(e.dueDate)),
  ].reduce((latest, d) => (d.getTime() > latest.getTime() ? d : latest), todayStart);
  const months = Math.max(4, monthsBetween(from, lastRelevant) + 2);

  const bills = buildCardBills({
    card,
    purchases,
    cardFixedExpenses,
    billEstimates,
    expensePayments,
    from,
    months,
  });
  const open = bills.filter((bill) => !bill.paid && bill.amount > 0);
  const used = open.reduce((sum, bill) => sum + bill.amount, 0);

  return {
    limit,
    used,
    available: Math.max(0, limit - used),
    percentUsed: Math.min(100, Math.round((used / limit) * 100)),
    overdueBillCount: open.filter((bill) => bill.dueDate.getTime() < todayStart.getTime()).length,
  };
}

export interface BudgetInput {
  incomes: IncomeInput[];
  incomeReceipts?: IncomeReceiptInput[];
  fixedExpenses: FixedExpenseInput[];
  creditCards: CreditCardInput[];
  cardPurchases: CardPurchaseInput[];
  billEstimates?: CardBillEstimateInput[];
  expensePayments?: ExpensePaymentInput[];
  transactions: TransactionInput[];
  jarDeposits?: JarDepositInput[];
  today: Date;
}

/**
 * As saídas comprometidas de um intervalo, pagas ou não: as ocorrências de
 * despesa fixa avulsa e as faturas que vencem nele, cada uma com o pagamento
 * que a quitou, se houver.
 */
function obligationsInRange(input: BudgetInput, start: Date, end: Date) {
  const {
    fixedExpenses,
    creditCards,
    cardPurchases,
    billEstimates = [],
    expensePayments = [],
  } = input;

  const fixedExpenseOccurrences = fixedExpenses
    .filter((exp) => !exp.cardId)
    .flatMap((exp) => {
      if (exp.dueDay == null) return [];
      return occurrencesInRange(exp.dueDay, start, end)
        .filter((occ) => isExpenseOccurrenceValid(occ, exp))
        .map((dueDate) => ({
          expenseId: exp.id,
          dueDate,
          estimate: exp.amount,
          payment: findExpensePayment(expensePayments, { fixedExpenseId: exp.id }, dueDate),
        }));
    });

  const cardBills = getCardBillsInPeriod(
    creditCards,
    cardPurchases,
    start,
    end,
    fixedExpenses.filter((exp) => exp.cardId),
    billEstimates,
  ).map((bill) => ({
    ...bill,
    payment: findExpensePayment(expensePayments, { cardId: bill.cardId }, bill.dueDate),
  }));

  return { fixedExpenseOccurrences, cardBills };
}

/**
 * O orçamento de um período com limites já conhecidos. `calculateDailyBudget`
 * acha os limites a partir de hoje; o encadeamento de saldos chama esta
 * direto, com os limites de cada período passado.
 */
export function budgetForBounds(
  input: BudgetInput & {
    periodStart: Date;
    periodEnd: Date;
    /**
     * O saldo em conta de agora, quando o usuário o informou. Com ele, o saldo
     * do período sai do dinheiro real: o que está no banco, mais o que ainda
     * vai entrar, menos o que ainda vai sair até o próximo pagamento.
     */
    accountBalance?: number | null;
    /** Sem saldo em conta: o que o período herdou do anterior. */
    openingBalance?: number;
  },
): PeriodBudget {
  const {
    incomes,
    incomeReceipts = [],
    transactions,
    jarDeposits = [],
    today,
    periodStart,
    periodEnd,
    accountBalance = null,
    openingBalance: historyOpening = 0,
  } = input;
  const todayStart = startOfDay(today);
  const active = boundingIncomes(incomes);

  /**
   * The most recent payday each income has already reached. Only the latest
   * one is tracked per income, so months of never confirming don't pile up
   * into a stack of reminders.
   *
   * Unlike the money below, this looks slightly further back than the
   * income's registration date: asking "did this arrive?" about a payday
   * from just before the user set the income up costs nothing, and it's the
   * only way that money can ever be accounted for.
   */
  const arrivedPaydays = active
    .map((inc) => ({ income: inc, occurrence: latestOccurrenceOnOrBefore(inc.dayOfMonth, today) }))
    .filter(({ income, occurrence }) => isPaydayAskable(occurrence, income.createdAt));

  /**
   * A payday keeps asking to be confirmed until the user answers, even after
   * a later payday has opened a new period — money that never showed up
   * shouldn't be silently forgotten.
   */
  const incomeReminders: IncomeReminder[] = arrivedPaydays
    .filter(({ income, occurrence }) => !isPaydayConfirmed(incomeReceipts, income.id, occurrence))
    .map(({ income, occurrence }) => ({
      incomeId: income.id,
      dueDate: occurrence,
      amount: income.amount,
    }));

  const inPeriod = (day: Date) =>
    day.getTime() >= periodStart.getTime() && day.getTime() < periodEnd.getTime();

  /**
   * Confirmed money funds the period its payday falls in, at the amount that
   * actually landed. An unconfirmed payday contributes nothing, so a salary
   * that hasn't arrived yet can't inflate the available budget.
   */
  const periodReceipts = incomeReceipts.filter((r) => inPeriod(storedDay(r.occurrenceDate)));
  const incomeTotal = periodReceipts.reduce((sum, r) => sum + r.amount, 0);

  /**
   * Toda ocorrência de despesa fixa e toda fatura do período, pagas ou não. Os
   * totais saem daqui, não dos lembretes: confirmar um pagamento tira o
   * lembrete da tela mas o dinheiro continua comprometido — se o total caísse
   * junto, o orçamento diário daria um salto na hora do "marcar como paga".
   */
  const { fixedExpenseOccurrences, cardBills } = obligationsInRange(input, periodStart, periodEnd);

  const fixedExpenseTotal = fixedExpenseOccurrences.reduce(
    (sum, occ) => sum + (occ.payment ? occ.payment.amount : occ.estimate),
    0,
  );
  const cardBillTotal = cardBills.reduce(
    (sum, bill) => sum + (bill.payment?.amount ?? bill.amount),
    0,
  );

  /**
   * O que venceu no período anterior e segue sem pagamento. Sem isto a conta
   * sumia da tela no dia em que o período virava, como se tivesse sido paga.
   * Olha um período para trás, não a história inteira: é o mesmo limite de
   * "o mês anterior" que o resto do encadeamento usa, e uma conta de meses
   * atrás que nunca foi marcada quase certamente foi paga e esquecida.
   */
  const previous = getPeriodBounds(incomes, addDaysLocal(periodStart, -1), incomeReceipts);
  const overdue =
    previous.periodEnd.getTime() === periodStart.getTime()
      ? obligationsInRange(input, previous.periodStart, previous.periodEnd)
      : { fixedExpenseOccurrences: [], cardBills: [] };

  const fixedExpenseReminders: FixedExpenseReminder[] = [
    ...overdue.fixedExpenseOccurrences
      .filter((occ) => !occ.payment)
      .map((occ) => ({
        expenseId: occ.expenseId,
        dueDate: occ.dueDate,
        amount: occ.estimate,
        overdue: true,
      })),
    ...fixedExpenseOccurrences
      .filter((occ) => !occ.payment)
      .map((occ) => ({ expenseId: occ.expenseId, dueDate: occ.dueDate, amount: occ.estimate })),
  ];

  const cardBillReminders: CardBillReminder[] = [
    ...overdue.cardBills
      .filter((bill) => !bill.payment)
      .map((bill) => ({
        cardId: bill.cardId,
        dueDate: bill.dueDate,
        amount: bill.amount,
        overdue: true,
      })),
    ...cardBills
      .filter((bill) => !bill.payment)
      .map((bill) => ({ cardId: bill.cardId, dueDate: bill.dueDate, amount: bill.amount })),
  ];

  const periodTransactions = transactions.filter(
    (t) => !t.fromPeriodClose && inPeriod(storedDay(t.date)),
  );
  const transactionTotal = periodTransactions.reduce((sum, t) => sum + t.amount, 0);

  const jarDepositTotal = jarDeposits
    .filter((d) => inPeriod(startOfDay(d.date)))
    .reduce((sum, d) => sum + d.amount, 0);

  const periodResult =
    incomeTotal - fixedExpenseTotal - cardBillTotal - transactionTotal - jarDepositTotal;

  let periodBalance: number;
  let openingSource: OpeningSource;
  if (accountBalance != null) {
    /**
     * O banco já contém tudo o que aconteceu até hoje. Falta só o que ainda
     * não aconteceu: contas do período sem pagamento (e as vencidas do anterior,
     * que também não saíram), lançamentos com data futura e recebimentos
     * confirmados para um dia que ainda não chegou.
     */
    const pendingOut =
      fixedExpenseReminders.reduce((sum, r) => sum + r.amount, 0) +
      cardBillReminders.reduce((sum, r) => sum + r.amount, 0) +
      periodTransactions
        .filter((t) => storedDay(t.date).getTime() > todayStart.getTime())
        .reduce((sum, t) => sum + t.amount, 0);
    const pendingIn = periodReceipts
      .filter((r) => storedDay(r.occurrenceDate).getTime() > todayStart.getTime())
      .reduce((sum, r) => sum + r.amount, 0);

    periodBalance = accountBalance - pendingOut + pendingIn;
    openingSource = "account";
  } else {
    periodBalance = historyOpening + periodResult;
    openingSource = "history";
  }

  const daysRemaining = Math.max(1, diffCalendarDays(periodEnd, today));

  return {
    periodStart,
    periodEnd,
    daysRemaining,
    // Com saldo em conta, a herança é o que sobra quando se tira do saldo final
    // o que o próprio período movimentou — o dinheiro que já estava lá antes.
    openingBalance: periodBalance - periodResult,
    openingSource,
    incomeTotal,
    fixedExpenseTotal,
    cardBillTotal,
    transactionTotal,
    jarDepositTotal,
    periodResult,
    periodBalance,
    dailyAvailable: periodBalance / daysRemaining,
    cardBillReminders,
    fixedExpenseReminders,
    incomeReminders,
  };
}

/**
 * O orçamento do período corrente. Sem `accountBalance` nem `openingBalance`,
 * o período abre do zero — é o que os testes antigos e os cálculos de um
 * período isolado querem. Quem mostra o orçamento de verdade passa por
 * `calculateCurrentBudget` (src/lib/carry-over.ts), que resolve a herança.
 */
export function calculateDailyBudget(
  input: BudgetInput & { accountBalance?: number | null; openingBalance?: number },
): PeriodBudget {
  const { periodStart, periodEnd } = getPeriodBounds(
    input.incomes,
    input.today,
    input.incomeReceipts,
  );
  return budgetForBounds({ ...input, periodStart, periodEnd });
}

function addDaysLocal(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/**
 * The period immediately preceding [periodStart, periodEnd) — used to detect
 * a just-closed period whose leftover hasn't been allocated to a jar yet.
 */
export function getPreviousPeriodBounds(
  incomes: IncomeInput[],
  periodStart: Date,
  incomeReceipts: IncomeReceiptInput[] = [],
): { periodStart: Date; periodEnd: Date } {
  const dayBeforeStart = new Date(periodStart);
  dayBeforeStart.setDate(dayBeforeStart.getDate() - 1);
  return getPeriodBounds(incomes, dayBeforeStart, incomeReceipts);
}

/**
 * O período imediatamente seguinte a [.., periodEnd) — a peça que permite
 * encadear ciclos para frente na previsão.
 *
 * `periodEnd` é sempre um dia de pagamento, então `getPeriodBounds` visto de
 * lá devolve ele mesmo como início: a ocorrência mais recente que não passou
 * de `periodEnd` é o próprio `periodEnd`. Não há atalho a escrever aqui — o
 * valor da função é dizer em voz alta o que essa chamada significa.
 */
export function getNextPeriodBounds(
  incomes: IncomeInput[],
  periodEnd: Date,
  incomeReceipts: IncomeReceiptInput[] = [],
): { periodStart: Date; periodEnd: Date } {
  return getPeriodBounds(incomes, periodEnd, incomeReceipts);
}
