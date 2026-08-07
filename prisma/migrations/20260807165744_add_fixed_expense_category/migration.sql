-- AlterTable
ALTER TABLE "FixedExpense" ADD COLUMN     "categoryId" TEXT;

-- CreateIndex
CREATE INDEX "FixedExpense_categoryId_idx" ON "FixedExpense"("categoryId");

-- AddForeignKey
ALTER TABLE "FixedExpense" ADD CONSTRAINT "FixedExpense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
