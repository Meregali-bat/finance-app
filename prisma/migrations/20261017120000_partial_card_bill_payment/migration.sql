-- Pagamento parcial de fatura de cartão.
--
-- Como na despesa fixa, uma fatura passa a poder ter vários pagamentos (os
-- parciais, com "settled" = false, e no fim o que a quita), e o par
-- (cardId, dueDate) deixa de ser único.

-- DropIndex
DROP INDEX "ExpensePayment_cardId_dueDate_key";

-- CreateIndex
CREATE INDEX "ExpensePayment_cardId_dueDate_idx" ON "ExpensePayment"("cardId", "dueDate");
