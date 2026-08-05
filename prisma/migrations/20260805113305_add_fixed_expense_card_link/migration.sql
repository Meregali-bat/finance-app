-- AlterTable
ALTER TABLE "FixedExpense" ADD COLUMN     "cardId" TEXT;

-- CreateIndex
CREATE INDEX "FixedExpense_cardId_idx" ON "FixedExpense"("cardId");

-- AddForeignKey
ALTER TABLE "FixedExpense" ADD CONSTRAINT "FixedExpense_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CreditCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
