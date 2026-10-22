-- O dia em que um depósito na caixinha deve voltar (resgate previsto).
ALTER TABLE "JarDeposit" ADD COLUMN "plannedWithdrawalAt" TIMESTAMP(3);
