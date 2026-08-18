-- Três coisas que o cartão não sabia dizer: quanto ele comporta, que uma compra
-- foi parcelada, e que uma fatura futura já tem valor previsto.

-- O limite é opcional: quem não informa não vê o bloco de usado/disponível, em
-- vez de ver um limite inventado. A coluna não se chama "limit" porque essa é
-- palavra reservada em SQL e precisaria de aspas em toda migration escrita à mão.

-- AlterTable
ALTER TABLE "CreditCard" ADD COLUMN "creditLimit" DECIMAL(65,30);

-- Ao contrário do `createdAt` dos lançamentos, aqui o DEFAULT pode preencher as
-- linhas antigas de uma vez: toda compra já gravada foi mesmo em uma parcela,
-- então o 1 é a verdade delas e não um dado fabricado.
--
-- `amount` continua sendo o TOTAL da compra. O valor da parcela é derivado em
-- src/lib/period.ts e não é gravado, para que editar "o valor da compra"
-- continue sendo editar um número que o usuário digitou.

-- AlterTable
ALTER TABLE "CardPurchase" ADD COLUMN "installments" INTEGER NOT NULL DEFAULT 1;

-- Sem UNIQUE (cardId, dueDate), ao contrário de ExpensePayment: lá existe
-- exatamente um ato de pagar a fatura de janeiro, o que deixa o pagamento ser um
-- upsert. Aqui a anuidade e o IOF podem cair na mesma fatura, e a restrição
-- forçaria juntar as duas numa linha só, apagando a descrição de cada uma.

-- CreateTable
CREATE TABLE "CardBillEstimate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardBillEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardBillEstimate_cardId_dueDate_idx" ON "CardBillEstimate"("cardId", "dueDate");

-- CreateIndex
CREATE INDEX "CardBillEstimate_userId_idx" ON "CardBillEstimate"("userId");

-- AddForeignKey
ALTER TABLE "CardBillEstimate" ADD CONSTRAINT "CardBillEstimate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardBillEstimate" ADD CONSTRAINT "CardBillEstimate_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CreditCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
