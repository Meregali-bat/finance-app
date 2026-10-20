-- AlterTable
ALTER TABLE "User" ADD COLUMN     "shortcutTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_shortcutTokenHash_key" ON "User"("shortcutTokenHash");

