-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "slice" TEXT;

-- AlterTable
ALTER TABLE "Jar" ADD COLUMN     "slice" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "budgetSlices" JSONB;

