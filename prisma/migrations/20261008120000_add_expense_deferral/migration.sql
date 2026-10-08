-- Adiar uma despesa fixa em vez de pagá-la.
--
-- A ocorrência adiada deixa de ser cobrada, e o valor dela vai para o mês
-- seguinte ou para depois da última parcela. "installmentCount" dá um fim à
-- despesa, que é o que permite falar em "depois da última parcela".

-- AlterTable
ALTER TABLE "FixedExpense" ADD COLUMN "installmentCount" INTEGER;

-- CreateTable
CREATE TABLE "ExpenseDeferral" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fixedExpenseId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "targetDueDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "mode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseDeferral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseDeferral_fixedExpenseId_dueDate_key" ON "ExpenseDeferral"("fixedExpenseId", "dueDate");

-- CreateIndex
CREATE INDEX "ExpenseDeferral_userId_idx" ON "ExpenseDeferral"("userId");

-- AddForeignKey
ALTER TABLE "ExpenseDeferral" ADD CONSTRAINT "ExpenseDeferral_fixedExpenseId_fkey" FOREIGN KEY ("fixedExpenseId") REFERENCES "FixedExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseDeferral" ADD CONSTRAINT "ExpenseDeferral_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
