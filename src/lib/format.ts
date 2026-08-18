export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amount);
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

export function formatDateLong(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

// A data de um lançamento é um dia do calendário, não um instante: o zod grava
// "YYYY-MM-DD" como meia-noite UTC. Ler de volta em horário local mostraria o
// dia anterior em fuso negativo — e, num ciclo editar/salvar, empurraria a data
// um dia para trás a cada gravação. Por isso as duas funções abaixo leem em UTC.

/** O dia de uma data de lançamento, já formatado. */
export function formatDateOnly(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

/** "17/08/26" — o dia no fuso pedido; sem fuso, no local. */
export function formatShortDate(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone,
  }).format(date);
}

/** "21:05" no fuso local. Montado à parte porque juntar tudo num
 *  `DateTimeFormat` só insere uma vírgula entre a data e a hora. */
function clockTime(instant: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(instant);
}

/**
 * Um lançamento: "17/08/26 21:05". O dia sai de `date` e é lido em UTC, pelo
 * motivo acima; a hora sai de `createdAt`, que é um instante de verdade e por
 * isso segue o fuso local. Sem `createdAt` — lançamentos anteriores à coluna —
 * sobra só o dia, que é melhor do que inventar 00:00.
 */
export function formatDateTime(date: Date, createdAt?: Date | null): string {
  const day = formatShortDate(date, "UTC");
  return createdAt ? `${day} ${clockTime(createdAt)}` : day;
}

/**
 * Um instante de verdade, como o `paidAt` de um pagamento: dia e hora saem
 * ambos do fuso local. Ler o dia em UTC aqui erraria a data na virada.
 */
export function formatInstant(instant: Date): string {
  return `${formatShortDate(instant)} ${clockTime(instant)}`;
}

/** O dia de uma data de lançamento como "YYYY-MM-DD", para `<input type="date">`. */
export function dateOnlyInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Today's date as a "YYYY-MM-DD" string, for defaultValue on `<input type="date">`. */
export function todayInputValue(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
}

/**
 * "12x de R$ 100,00", ou nulo numa compra à vista.
 *
 * A parcela anunciada é a PRIMEIRA, que é onde a sobra dos centavos cai — ver
 * installmentSlices em src/lib/period.ts. Dizer "3x de R$ 333,33" quando a
 * primeira fatura vai cobrar R$ 333,34 seria mentir por um centavo.
 */
export function installmentLabel(total: number, installments: number): string | null {
  if (!Number.isInteger(installments) || installments <= 1) return null;
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / installments);
  const first = base + (cents - base * installments);
  return `${installments}x de ${formatCurrency(first / 100)}`;
}
