import { Refusal } from "@/lib/action-result";

/**
 * Os ids de cartão e de categoria que chegam do navegador são texto qualquer:
 * quem tem uma conta pode mandar o id de um cartão ou de uma categoria de
 * outra pessoa. O banco aceita — a chave estrangeira só exige que a linha
 * exista —, e a compra gravada no cartão alheio aparecia na fatura do dono.
 *
 * Toda action que grava um desses ids passa por aqui antes: o id só vale se for
 * da própria pessoa.
 *
 * Recebe o cliente do Prisma (ou o `tx` de uma transação) em vez de importá-lo,
 * para os testes poderem trocar por um falso.
 */
export interface OwnershipClient {
  creditCard: {
    findFirst(args: {
      where: { id: string; userId: string; deletedAt: null };
      select: { id: true; closingDay: true };
    }): PromiseLike<{ id: string; closingDay: number } | null>;
  };
  category: {
    findFirst(args: {
      where: { id: string; userId: string };
      select: { id: true };
    }): PromiseLike<{ id: string } | null>;
  };
}

/** O cartão, se for da pessoa e não estiver apagado. Senão, recusa. */
export async function ownCard(db: OwnershipClient, userId: string, cardId: string) {
  const card = cardId
    ? await db.creditCard.findFirst({
        where: { id: cardId, userId, deletedAt: null },
        select: { id: true, closingDay: true },
      })
    : null;
  if (!card) throw new Refusal("Cartão não encontrado.");
  return card;
}

/** O cartão opcional de um formulário: vazio é "sem cartão", e um id alheio recusa. */
export async function ownCardIdOrNull(
  db: OwnershipClient,
  userId: string,
  cardId: string | null | undefined,
): Promise<string | null> {
  if (!cardId) return null;
  return (await ownCard(db, userId, cardId)).id;
}

/**
 * A categoria de um formulário: vazio é "sem categoria", e um id alheio
 * recusa. Uma desativada continua valendo — editar um gasto antigo não pode
 * obrigar a trocar a categoria que ele já tinha.
 */
export async function ownCategoryIdOrNull(
  db: OwnershipClient,
  userId: string,
  categoryId: string | null | undefined,
): Promise<string | null> {
  if (!categoryId) return null;
  const category = await db.category.findFirst({
    where: { id: categoryId, userId },
    select: { id: true },
  });
  if (!category) throw new Refusal("Categoria não encontrada.");
  return category.id;
}
