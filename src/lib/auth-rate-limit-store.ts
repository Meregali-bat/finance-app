import { prisma } from "@/lib/prisma";
import { LONGEST_WINDOW_MS, hashKey, type AttemptStore } from "@/lib/auth-rate-limit";

/**
 * O limite de tentativas gravado no banco (tabela AuthAttempt).
 *
 * O lock é `pg_advisory_xact_lock`, preso à transação, como na cota de IA:
 * vale pelo transaction pooler do Supabase e solta no commit. As chaves são
 * travadas sempre na mesma ordem, para duas transações com as mesmas chaves
 * não se esperarem em cruz.
 */
export const prismaAttemptStore: AttemptStore = {
  async reserve(rules, now, decide) {
    const hashes = rules.map((r) => hashKey(r.key));
    const result = await prisma.$transaction(async (tx) => {
      for (const h of [...new Set(hashes)].sort()) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`auth-attempt:${h}`}))`;
      }
      // Uma consulta por vez: dentro da transação é tudo a mesma conexão.
      const recent: Date[][] = [];
      for (const [i, rule] of rules.entries()) {
        const rows = await tx.authAttempt.findMany({
          where: { keyHash: hashes[i], createdAt: { gt: new Date(now.getTime() - rule.windowMs) } },
          select: { createdAt: true },
        });
        recent.push(rows.map((r) => r.createdAt));
      }
      const decision = decide(recent);
      if (!decision.ok) return { refused: decision };
      const ids: string[] = [];
      for (const keyHash of hashes) {
        const { id } = await tx.authAttempt.create({ data: { keyHash, createdAt: now }, select: { id: true } });
        ids.push(id);
      }
      return { ids };
    });
    // Faxina, fora da transação e sem travar o login se falhar: nada mais
    // velho que a maior janela conta para regra nenhuma.
    await prisma.authAttempt
      .deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - LONGEST_WINDOW_MS) } } })
      .catch((e) => console.error("Limite de tentativas: falha na faxina", e));
    return result;
  },
  async release(ids) {
    if (ids.length) await prisma.authAttempt.deleteMany({ where: { id: { in: ids } } });
  },
  async clear(key) {
    await prisma.authAttempt.deleteMany({ where: { keyHash: hashKey(key) } });
  },
};
