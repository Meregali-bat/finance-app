/**
 * O preço da assinatura, num lugar só, para a landing.
 *
 * Ainda em definição: enquanto `mensal` for null, a página mostra "preço em
 * breve" e não promete valor nenhum. Para publicar o preço, basta preencher
 * os campos abaixo (valores em reais).
 */
export const PLANO: {
  /** Preço por mês, em reais. null: ainda não definido. */
  mensal: number | null;
  /** Preço por ano, em reais. null: sem plano anual. */
  anual: number | null;
  /** Dias de teste grátis antes da primeira cobrança. null: sem teste. */
  diasDeTeste: number | null;
} = {
  mensal: null,
  anual: null,
  diasDeTeste: null,
};
