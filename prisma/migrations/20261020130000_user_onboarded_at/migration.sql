-- Primeiro uso: quando a conta terminou o passo a passo de /comecar.
-- AlterTable
ALTER TABLE "User" ADD COLUMN "onboardedAt" TIMESTAMP(3);

-- Quem já existe já usa o app: não deve cair no passo a passo.
UPDATE "User" SET "onboardedAt" = "createdAt";
