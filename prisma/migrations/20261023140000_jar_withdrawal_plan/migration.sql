-- Resgates agendados para dinheiro que já estava na caixinha.
CREATE TABLE "JarWithdrawalPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jarId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JarWithdrawalPlan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JarWithdrawalPlan_jarId_idx" ON "JarWithdrawalPlan"("jarId");
CREATE INDEX "JarWithdrawalPlan_userId_idx" ON "JarWithdrawalPlan"("userId");

ALTER TABLE "JarWithdrawalPlan" ADD CONSTRAINT "JarWithdrawalPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JarWithdrawalPlan" ADD CONSTRAINT "JarWithdrawalPlan_jarId_fkey" FOREIGN KEY ("jarId") REFERENCES "Jar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
