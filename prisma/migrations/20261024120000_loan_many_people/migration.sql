-- Uma despesa pode ser emprestada para mais de uma pessoa: a conta dividida.
DROP INDEX "Loan_transactionId_key";
DROP INDEX "Loan_cardPurchaseId_key";

CREATE INDEX "Loan_transactionId_idx" ON "Loan"("transactionId");
CREATE INDEX "Loan_cardPurchaseId_idx" ON "Loan"("cardPurchaseId");
