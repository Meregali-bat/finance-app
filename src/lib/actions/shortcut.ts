"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { hashShortcutToken, newShortcutToken } from "@/lib/shortcut";

/**
 * Gera a chave do atalho e devolve ela — a única vez que ela aparece. Gerar de
 * novo troca a chave: o atalho com a antiga para de lançar.
 */
export async function generateShortcutToken(): Promise<string> {
  const userId = await requireUserId();
  const token = newShortcutToken();
  await prisma.user.update({
    where: { id: userId },
    data: { shortcutTokenHash: hashShortcutToken(token) },
  });
  revalidatePath("/cartoes");
  return token;
}

/** Desliga o lançamento automático: nenhuma chave vale mais. */
export async function revokeShortcutToken() {
  const userId = await requireUserId();
  await prisma.user.update({ where: { id: userId }, data: { shortcutTokenHash: null } });
  revalidatePath("/cartoes");
}

/**
 * Responde "de qual cartão é" um nome que a Carteira mandou. Com um cartão,
 * as próximas compras com esse nome vão direto para ele, e as que já entraram
 * como gasto da conta são movidas para a fatura. Com "account", fica como
 * gasto da conta (é débito) e a pergunta some.
 */
export async function linkWalletCard(aliasId: string, target: string) {
  const userId = await requireUserId();
  const alias = await prisma.walletCardAlias.findFirstOrThrow({
    where: { id: aliasId, userId },
  });

  if (target === "account") {
    await prisma.$transaction([
      prisma.walletCardAlias.update({ where: { id: alias.id }, data: { asAccount: true } }),
      prisma.transaction.updateMany({
        where: { userId, walletCardName: alias.walletName },
        data: { walletCardName: null },
      }),
    ]);
    revalidatePath("/cartoes");
    return;
  }

  const card = await prisma.creditCard.findFirstOrThrow({
    where: { id: target, userId, deletedAt: null },
    select: { id: true },
  });
  const stranded = await prisma.transaction.findMany({
    where: { userId, walletCardName: alias.walletName },
  });
  await prisma.$transaction([
    prisma.walletCardAlias.update({
      where: { id: alias.id },
      data: { cardId: card.id, asAccount: false },
    }),
    ...stranded.map((t) =>
      prisma.cardPurchase.create({
        data: {
          userId,
          cardId: card.id,
          amount: t.amount,
          description: t.description,
          date: t.date,
          createdAt: t.createdAt,
          categoryId: t.categoryId,
        },
      }),
    ),
    prisma.transaction.deleteMany({ where: { id: { in: stranded.map((t) => t.id) } } }),
  ]);
  revalidatePath("/cartoes");
  revalidatePath(`/cartoes/${card.id}`);
  revalidatePath("/");
  revalidatePath("/historico");
}
