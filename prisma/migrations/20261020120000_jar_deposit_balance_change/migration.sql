-- Resgate maior que o saldo da caixinha (o rendimento do CDB): guarda quanto o
-- saldo realmente mudou, para o "Desfazer" devolver o saldo de antes.
-- AlterTable
ALTER TABLE "JarDeposit" ADD COLUMN "balanceChange" DECIMAL(65,30);
