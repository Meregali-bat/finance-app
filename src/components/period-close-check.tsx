import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { getPendingPeriodClose } from "@/lib/actions/period";
import { PeriodCloseModal } from "@/components/period-close-modal";

export async function PeriodCloseCheck() {
  const pending = await getPendingPeriodClose();
  if (!pending) return null;

  const userId = await requireUserId();
  const jars = await prisma.jar.findMany({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  return (
    <PeriodCloseModal
      periodEndIso={pending.periodEnd}
      leftoverAmount={pending.leftoverAmount}
      jars={jars}
    />
  );
}
