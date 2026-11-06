import { prisma } from "@/lib/prisma";
import { withAiQuota, type AiFeature, type AiUsageStore } from "@/lib/ai-quota";

/**
 * A cota de IA gravada no banco (tabela AiUsage).
 *
 * O lock é `pg_advisory_xact_lock`, preso à transação: vale também pelo
 * transaction pooler do Supabase, e solta sozinho no commit. Sem ele, duas
 * chamadas ao mesmo tempo leriam a mesma contagem e passariam as duas.
 */
export const prismaAiUsageStore: AiUsageStore = {
  async reserve(userId, feature, since, decide) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ai-quota:${userId}`}))`;
      const recent = await tx.aiUsage.findMany({
        where: { userId, createdAt: { gt: since } },
        select: { createdAt: true },
      });
      const decision = decide(recent.map((r) => r.createdAt));
      if (!decision.ok) return { refused: decision };
      const { id } = await tx.aiUsage.create({ data: { userId, feature }, select: { id: true } });
      return { id };
    });
  },
  async release(id) {
    await prisma.aiUsage.deleteMany({ where: { id } });
  },
};

/** `withAiQuota` com o banco de verdade: o que as actions chamam. */
export function withUserAiQuota<T>(userId: string, feature: AiFeature, call: () => Promise<T>) {
  return withAiQuota(prismaAiUsageStore, userId, feature, call);
}
