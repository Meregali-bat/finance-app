-- O teto de comprometimento que a pergunta "posso comprar isso?" usa para reprovar
-- uma compra que cabe no saldo mas aperta o mês.
--
-- Uma coluna no User, e não uma tabela de configurações: é um número só, e uma tabela
-- cobraria uma consulta a mais, um upsert na primeira gravação e uma chave estrangeira
-- para guardá-lo. Mesma escolha que CreditCard.creditLimit já faz.
--
-- Sem DEFAULT de propósito. NULL é "nunca configurou", e o padrão mora em
-- src/lib/purchase-simulation.ts, onde a tela consegue dizer em voz alta que está
-- usando um padrão. Um DEFAULT 70 aqui faria os dois casos virarem o mesmo 70 e a
-- diferença se perderia para sempre na primeira gravação.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "commitmentLimitPercent" INTEGER;
