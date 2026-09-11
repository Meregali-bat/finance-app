-- Saldo em conta na tela de início.
--
-- O schema não conhece a conta bancária, então o saldo real não é derivável
-- sozinho: falta o ponto de partida. Cada linha aqui é uma leitura do extrato
-- informada pelo usuário, e o saldo exibido soma a partir da mais recente.
--
-- Uma linha por correção em vez de uma coluna sobrescrita: `createdAt` é o
-- marco que separa o que já estava no valor informado do que veio depois —
-- sobrescrever apagaria essa fronteira e o saldo passaria a contar duas vezes.

-- CreateTable
CREATE TABLE "BalanceAdjustment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalanceAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BalanceAdjustment_userId_createdAt_idx" ON "BalanceAdjustment"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "BalanceAdjustment" ADD CONSTRAINT "BalanceAdjustment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
