-- Transferência entre contas da própria pessoa: move o saldo, mas não é
-- renda nem gasto.
ALTER TABLE "Transaction" ADD COLUMN "transfer" BOOLEAN NOT NULL DEFAULT false;
