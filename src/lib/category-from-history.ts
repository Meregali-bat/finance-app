import { prisma } from "@/lib/prisma";

/**
 * A categoria do último lançamento (na conta ou no cartão) com a mesma
 * descrição, sem diferença de maiúsculas. É o palpite de quem lança sem
 * escolher: o atalho do iPhone e a importação de extrato.
 */
export async function categoryFromHistory(userId: string, description: string) {
  const where = {
    userId,
    categoryId: { not: null },
    description: { equals: description, mode: "insensitive" as const },
  };
  const [purchase, transaction] = await Promise.all([
    prisma.cardPurchase.findFirst({
      where,
      orderBy: { date: "desc" },
      select: { categoryId: true, date: true },
    }),
    prisma.transaction.findFirst({
      where,
      orderBy: { date: "desc" },
      select: { categoryId: true, date: true },
    }),
  ]);
  const latest =
    purchase && transaction
      ? purchase.date >= transaction.date
        ? purchase
        : transaction
      : (purchase ?? transaction);
  return latest?.categoryId ?? null;
}
