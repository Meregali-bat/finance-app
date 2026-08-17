/**
 * O fuso da app é fixo. Ela é de uma pessoa só, no Brasil, e o servidor e o
 * aparelho precisam concordar sobre que dia é hoje — senão a conta de
 * calendário dá resultados diferentes dos dois lados da hidratação.
 *
 * Sem isto o Node da Vercel roda em UTC, e aparecem dois defeitos:
 *
 * - das 21h à meia-noite o servidor já virou o dia, então o filtro "Hoje"
 *   mostra amanhã e `daysRemaining` erra por um, o que muda o orçamento
 *   diário;
 * - a hora de um lançamento saía no HTML em UTC e era reescrita no fuso do
 *   aparelho na hidratação — "13:11" virava "10:11", e o React descartava a
 *   lista inteira para renderizar de novo no cliente.
 *
 * `TZ` é nome reservado nas variáveis de ambiente da Vercel, por isso ele é
 * definido aqui: `register()` roda uma vez, antes da primeira requisição.
 */
export function register() {
  process.env.TZ = "America/Sao_Paulo";
}
