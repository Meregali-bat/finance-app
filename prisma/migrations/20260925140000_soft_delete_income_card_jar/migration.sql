-- Apagar renda, cartão ou caixinha deixa de apagar o passado.
--
-- As três eram deletadas de verdade, e o cascade levava junto recebimentos,
-- compras, pagamentos e depósitos: o Histórico perdia dinheiro que de fato se
-- moveu, e o saldo em conta e o orçamento eram reescritos. Agora apagar só
-- marca a linha e a tira das listas.

-- AlterTable
ALTER TABLE "Income" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CreditCard" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Jar" ADD COLUMN "deletedAt" TIMESTAMP(3);
