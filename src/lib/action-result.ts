import { ZodError } from "zod";

/**
 * Uma recusa que a pessoa precisa ler: "Resgate o saldo antes de apagar", "Esta
 * ocorrência já foi paga". Lançada dentro de uma action embrulhada em
 * `refusing`, ela volta como `{ error }` em vez de erro.
 *
 * Por quê: no site publicado, o Next troca a mensagem de todo erro lançado no
 * servidor por um texto genérico. O motivo da recusa — o que diz à pessoa o
 * que fazer — só chegava no localhost.
 */
export class Refusal extends Error {}

export type Refused = { error: string };

/**
 * Roda o corpo de uma action devolvendo recusas e erros de validação como
 * `{ error }`. Qualquer outro erro continua sendo lançado: o texto dele é
 * interno e não deve ir para a tela.
 */
export async function refusing<T>(body: () => Promise<T>): Promise<T | Refused> {
  try {
    return await body();
  } catch (e) {
    if (e instanceof Refusal) return { error: e.message };
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Confira os campos." };
    throw e;
  }
}

/**
 * No cliente: a recusa vira um erro com a mensagem dela, para o `catch` de
 * sempre (com `errorMessage`) mostrar o motivo.
 */
export function unwrap<T>(result: T): Exclude<T, Refused> {
  if (
    result &&
    typeof result === "object" &&
    "error" in result &&
    typeof (result as Refused).error === "string"
  ) {
    throw new Error((result as Refused).error);
  }
  return result as Exclude<T, Refused>;
}
