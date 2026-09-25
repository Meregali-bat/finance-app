-- Uma despesa fixa que costuma sair da conta pode, num mês, ser paga no cartão.
-- O valor vira uma CardPurchase (entra na fatura) e o ExpensePayment da ocorrência
-- fica com amount 0, ligado a ela — assim o dinheiro conta uma vez só.

-- AlterTable
ALTER TABLE "ExpensePayment" ADD COLUMN "cardPurchaseId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ExpensePayment_cardPurchaseId_key" ON "ExpensePayment"("cardPurchaseId");

-- AddForeignKey
ALTER TABLE "ExpensePayment" ADD CONSTRAINT "ExpensePayment_cardPurchaseId_fkey" FOREIGN KEY ("cardPurchaseId") REFERENCES "CardPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
