-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "walletCardName" TEXT;

-- CreateTable
CREATE TABLE "WalletCardAlias" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "walletName" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "cardId" TEXT,
    "asAccount" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletCardAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WalletCardAlias_userId_normalized_key" ON "WalletCardAlias"("userId", "normalized");

-- AddForeignKey
ALTER TABLE "WalletCardAlias" ADD CONSTRAINT "WalletCardAlias_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletCardAlias" ADD CONSTRAINT "WalletCardAlias_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CreditCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

