-- Pausar uma despesa fixa deixa de ser apagado pela reativação.
--
-- A pausa era gravada em "FixedExpense"."endedAt", e reativar limpava a
-- coluna: os meses pausados voltavam a ser cobrados retroativamente. Cada
-- pausa passa a ser um intervalo próprio; "endedAt" fica só para o
-- encerramento definitivo (apagar).

-- CreateTable
CREATE TABLE "FixedExpensePause" (
    "id" TEXT NOT NULL,
    "fixedExpenseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FixedExpensePause_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FixedExpensePause_fixedExpenseId_idx" ON "FixedExpensePause"("fixedExpenseId");

-- CreateIndex
CREATE INDEX "FixedExpensePause_userId_idx" ON "FixedExpensePause"("userId");

-- AddForeignKey
ALTER TABLE "FixedExpensePause" ADD CONSTRAINT "FixedExpensePause_fixedExpenseId_fkey" FOREIGN KEY ("fixedExpenseId") REFERENCES "FixedExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedExpensePause" ADD CONSTRAINT "FixedExpensePause_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- As despesas pausadas hoje (desligadas, mas não apagadas) viram uma pausa em
-- aberto desde o "endedAt" delas, que deixa de valer como encerramento.
INSERT INTO "FixedExpensePause" ("id", "fixedExpenseId", "userId", "startedAt")
SELECT 'pause_' || md5("id" || clock_timestamp()::text), "id", "userId", "endedAt"
FROM "FixedExpense"
WHERE "active" = false AND "deletedAt" IS NULL AND "endedAt" IS NOT NULL;

UPDATE "FixedExpense" SET "endedAt" = NULL
WHERE "active" = false AND "deletedAt" IS NULL;
