-- De onde contam as parcelas de uma despesa fixa: o próximo vencimento de
-- quando o número de parcelas foi salvo, e não o cadastro.
ALTER TABLE "FixedExpense" ADD COLUMN "installmentsFrom" TIMESTAMP(3);
