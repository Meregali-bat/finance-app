-- CreateTable
CREATE TABLE "StatementIgnore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatementIgnore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StatementIgnore_userId_fingerprint_key" ON "StatementIgnore"("userId", "fingerprint");

-- AddForeignKey
ALTER TABLE "StatementIgnore" ADD CONSTRAINT "StatementIgnore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

