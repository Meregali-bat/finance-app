/**
 * O fuso do servidor passa a ser o do usuário.
 *
 * O app inteiro decide "que dia é hoje" com `new Date()` lido no fuso do
 * processo: quando o período vira, o que é "Movimentações de hoje", quantos
 * dias faltam. Em produção o servidor roda em UTC, e depois das 21h em
 * Brasília ele já está no dia seguinte — o período virava na véspera do
 * pagamento e a lista de hoje mostrava a de amanhã.
 *
 * As datas de calendário gravadas no banco não dependem disto (são lidas pela
 * parte UTC, ver `storedDay` em src/lib/period.ts), então trocar o fuso muda
 * só o "hoje", que é o que estava errado.
 *
 * `APP_TIME_ZONE` troca o padrão. O `TZ` do ambiente é sobrescrito de
 * propósito: há hospedagens que o fixam em UTC.
 */
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  process.env.TZ = process.env.APP_TIME_ZONE || "America/Sao_Paulo";
}
