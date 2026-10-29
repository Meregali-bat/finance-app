/**
 * O tom do hero da Início: qual dos quatro estados o número do dia está.
 * Puro e testado; não mexe em nenhuma conta, só lê o que a tela já tem.
 *
 * - `negative`: o período fecha no vermelho (número do dia abaixo de zero).
 * - `allToSavings`: zero porque a reserva de guardar levou o que sobrava.
 * - `tight`: não negativo, mas apertado: abaixo de `TIGHT_SHARE` do ritmo de
 *   abertura do período, ou abaixo do que já saiu hoje. Um zero sem reserva
 *   de guardar também cai aqui — é o dia mais apertado que existe.
 * - `normal`: o resto.
 *
 * A ordem é essa. O `allToSavings` vem antes do `tight` porque ele é um zero
 * escolhido — a pessoa mandou guardar —, e não um dia magro: pintar de
 * "apertado" seria bronca por uma decisão dela. Na prática os dois nem se
 * cruzam, já que o apertado exige um número acima de zero.
 */
export type HeroTone = "negative" | "allToSavings" | "tight" | "normal";

/** Abaixo de 25% do ritmo com que o período começou, o dia é apertado. */
export const TIGHT_SHARE = 0.25;

/** Menos de meio centavo conta como zero, como no resto da Início. */
const ZERO = 0.005;

export function heroTone(input: {
  /** O número do dia. */
  dailyAvailable: number;
  /** Dias até o pagamento, contando hoje. */
  daysRemaining: number;
  /** Dias do período inteiro. */
  totalDays: number;
  /** O dia a dia já gasto no período, hoje incluído (a curva do hero). */
  spentInPeriod: number;
  /** O que já saiu hoje, na conta e no cartão. */
  spentToday: number;
  /** O que as fatias tiram do número do dia para guardar. */
  savingsApplied: number;
}): HeroTone {
  const { dailyAvailable, daysRemaining, totalDays, spentInPeriod, spentToday } = input;
  if (dailyAvailable < 0) return "negative";
  if (dailyAvailable < ZERO && input.savingsApplied > ZERO) return "allToSavings";

  // O ritmo de abertura, reconstruído: o livre que ainda resta mais o dia a
  // dia que já saiu, dividido pelo período todo. É o número do dia que o
  // período teria no primeiro dia se nada além do gasto tivesse mudado.
  const openingDaily =
    totalDays > 0 ? (dailyAvailable * daysRemaining + spentInPeriod) / totalDays : 0;
  const belowOpening = openingDaily > ZERO && dailyAvailable < openingDaily * TIGHT_SHARE;
  // Hoje já saiu mais do que o dia médio que sobra: repetir amanhã não cabe.
  const belowToday = spentToday > ZERO && dailyAvailable < spentToday;
  return belowOpening || belowToday ? "tight" : "normal";
}
