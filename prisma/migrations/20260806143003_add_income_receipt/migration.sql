-- CreateTable
CREATE TABLE "IncomeReceipt" (
    "id" TEXT NOT NULL,
    "incomeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "occurrenceDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncomeReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncomeReceipt_userId_idx" ON "IncomeReceipt"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "IncomeReceipt_incomeId_occurrenceDate_key" ON "IncomeReceipt"("incomeId", "occurrenceDate");

-- AddForeignKey
ALTER TABLE "IncomeReceipt" ADD CONSTRAINT "IncomeReceipt_incomeId_fkey" FOREIGN KEY ("incomeId") REFERENCES "Income"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeReceipt" ADD CONSTRAINT "IncomeReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
