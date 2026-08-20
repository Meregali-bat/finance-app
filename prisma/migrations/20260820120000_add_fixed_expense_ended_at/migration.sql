-- Encerrar uma despesa fixa deixa de ser retroativo.
--
-- Antes, apagar uma assinatura de cartão a fazia sumir também dos meses em que
-- ela foi cobrada de verdade — ela não tem registro próprio, o Histórico a
-- deriva da linha viva. `endedAt` diz onde cortar; `deletedAt` só a esconde
-- das listas de Fixos.

-- AlterTable
ALTER TABLE "FixedExpense" ADD COLUMN "endedAt" TIMESTAMP(3);
ALTER TABLE "FixedExpense" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Uma despesa já pausada não tem data de encerramento gravada, e sem carimbar
-- uma ela voltaria a ser cobrada em todo ciclo passado assim que as telas
-- passassem a confiar na janela em vez do booleano.
UPDATE "FixedExpense" SET "endedAt" = CURRENT_TIMESTAMP WHERE "active" = false;
