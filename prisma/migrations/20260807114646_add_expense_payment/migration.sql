-- CreateTable
CREATE TABLE "ExpensePayment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fixedExpenseId" TEXT,
    "cardId" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpensePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExpensePayment_userId_paidAt_idx" ON "ExpensePayment"("userId", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExpensePayment_fixedExpenseId_dueDate_key" ON "ExpensePayment"("fixedExpenseId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "ExpensePayment_cardId_dueDate_key" ON "ExpensePayment"("cardId", "dueDate");

-- AddForeignKey
ALTER TABLE "ExpensePayment" ADD CONSTRAINT "ExpensePayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpensePayment" ADD CONSTRAINT "ExpensePayment_fixedExpenseId_fkey" FOREIGN KEY ("fixedExpenseId") REFERENCES "FixedExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpensePayment" ADD CONSTRAINT "ExpensePayment_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CreditCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
