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
