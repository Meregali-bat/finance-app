/**
 * A mensagem de um erro para mostrar na tela.
 *
 * No site publicado, o Next esconde o texto dos erros lançados no servidor e
 * entrega no lugar um "Minified React error" ou "An error occurred in the
 * Server Components render" — que a pessoa via cru embaixo do formulário.
 * Esses viram uma frase em português; os erros de verdade do navegador (sem
 * rede, por exemplo) passam como estão.
 */
export function errorMessage(
  error: unknown,
  fallback = "Não deu para salvar. Tente de novo.",
): string {
  if (!(error instanceof Error) || !error.message) return fallback;
  const message = error.message;
  if (
    /Minified React error|Server Components render|digest|An unexpected response/i.test(message)
  ) {
    return fallback;
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
    return "Sem conexão. Confira a internet e tente de novo.";
  }
  return message;
}
