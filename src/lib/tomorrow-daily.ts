/**
 * Quanto o número do dia vira amanhã se hoje não sair mais nada. Puro, só lê
 * o que a Início já tem; não refaz nenhuma conta do orçamento.
 *
 * O número do dia é um bolo fixo dividido pelos dias que faltam, hoje
 * incluído: o livre do período corrente (já sem o que fica reservado para um
 * ciclo à frente e, com as fatias, sem o que falta guardar) sobre
 * `daysRemaining`. O gasto de hoje já saiu do bolo. As contas, faturas e
 * agendados do período já estão nele, e a reserva e o guardar dependem dos
 * ciclos à frente e da renda, não do dia — então, sem gasto novo, o bolo de
 * amanhã é o mesmo, dividido por um dia a menos:
 * `dailyAvailable × daysRemaining ÷ (daysRemaining − 1)`.
 *
 * Devolve `null` quando a frase não teria o que dizer: no último dia (não há
 * amanhã dentro do período), com o número negativo ou zero (dividir zero dá
 * zero; o negativo só piora) ou quando, arredondado ao centavo, não sobe.
 */
export function tomorrowDaily(input: {
  /** O número do dia, já com o gasto de hoje descontado. */
  dailyAvailable: number;
  /** Dias até o pagamento, contando hoje. */
  daysRemaining: number;
}): number | null {
  const { dailyAvailable, daysRemaining } = input;
  if (daysRemaining <= 1 || dailyAvailable <= 0) return null;
  const tomorrow = (dailyAvailable * daysRemaining) / (daysRemaining - 1);
  return Math.round(tomorrow * 100) > Math.round(dailyAvailable * 100) ? tomorrow : null;
}
