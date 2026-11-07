import { prisma } from "@/lib/prisma";
import { paidBeforeReading } from "@/lib/account-balance";

/**
 * As datas de um pagamento que a pessoa diz já ter saído do saldo que ela
 * informou: entra na leitura mais recente (ver `paidBeforeReading`). Sem
 * leitura nenhuma não há saldo para proteger, e o pagamento fica como veio —
 * uma leitura feita depois já o deixa de fora sozinha.
 */
export async function placeBeforeLatestReading(
  userId: string,
  paidAt: Date,
): Promise<{ paidAt: Date; createdAt?: Date }> {
  const reading = await prisma.balanceAdjustment.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return reading ? paidBeforeReading(paidAt, reading.createdAt) : { paidAt };
}
