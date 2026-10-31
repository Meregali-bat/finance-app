-- AlterTable
ALTER TABLE "ExpensePayment" ADD COLUMN "advanceTransactionId" TEXT;

-- CreateIndex
CREATE INDEX "ExpensePayment_advanceTransactionId_idx" ON "ExpensePayment"("advanceTransactionId");

-- AddForeignKey
ALTER TABLE "ExpensePayment" ADD CONSTRAINT "ExpensePayment_advanceTransactionId_fkey" FOREIGN KEY ("advanceTransactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
