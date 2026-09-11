-- O saldo em conta precisa distinguir dinheiro que se moveu de artefato contábil.
--
-- O fechamento de período grava a sobra como lançamento negativo (ou como depósito
-- em caixinha). Para o orçamento isso é correto: a sobra volta como folga do período
-- seguinte. Para o saldo em conta é ruído — aquele dinheiro já estava no banco, e
-- somá-lo de novo faz o saldo subir sozinho uma vez por período.
--
-- Uma coluna e não um match por descrição: a descrição é editável pelo usuário, e o
-- saldo passaria a mentir no dia em que ele renomeasse o lançamento.

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "fromPeriodClose" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "JarDeposit" ADD COLUMN "fromPeriodClose" BOOLEAN NOT NULL DEFAULT false;

-- As linhas já gravadas não têm outra marca além do texto que o app escreveu nelas.
-- Casar por texto é frágil como regra permanente, mas aqui é um backfill único sobre
-- o passado, e é a única forma de recuperar o que já está no banco.
UPDATE "Transaction" SET "fromPeriodClose" = true WHERE "description" = 'Saldo do período anterior';
UPDATE "JarDeposit" SET "fromPeriodClose" = true WHERE "note" = 'Sobra do período anterior';
