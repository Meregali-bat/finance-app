-- A hora exibida num lançamento sai daqui: `date` é um dia do calendário
-- (meia-noite UTC, gravada pelo <input type="date">) e não carrega horário.
--
-- Os dois passos são separados de propósito. `ADD COLUMN ... DEFAULT` preenche
-- as linhas existentes com o default, o que carimbaria em todo lançamento
-- antigo o instante desta migration — uma hora inventada, igual para todos.
-- Adicionando a coluna sem default, elas ficam NULL e a tela mostra só o dia.

-- AlterTable
ALTER TABLE "CardPurchase" ADD COLUMN "createdAt" TIMESTAMP(3);
ALTER TABLE "CardPurchase" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "createdAt" TIMESTAMP(3);
ALTER TABLE "Transaction" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
