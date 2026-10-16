-- Pagamento parcial de despesa fixa.
--
-- Um pagamento com "settled" = false abate do valor da ocorrência sem quitá-la.
-- Por isso uma ocorrência passa a poder ter vários pagamentos, e o par
-- (fixedExpenseId, dueDate) deixa de ser único.

-- AlterTable
ALTER TABLE "ExpensePayment" ADD COLUMN "settled" BOOLEAN NOT NULL DEFAULT true;

-- DropIndex
DROP INDEX "ExpensePayment_fixedExpenseId_dueDate_key";

-- CreateIndex
CREATE INDEX "ExpensePayment_fixedExpenseId_dueDate_idx" ON "ExpensePayment"("fixedExpenseId", "dueDate");
