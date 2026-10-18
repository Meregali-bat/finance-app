import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Os campos "Emprestado para alguém" dos formulários de despesa, e o que
 * fazer com eles ao salvar. Fica fora dos arquivos de action porque é chamado
 * de dentro deles, na mesma transação da despesa.
 */
const loanSchema = z.object({
  personId: z.string().trim().optional(),
  personName: z.string().trim().max(60).optional(),
  amount: z.coerce.number().positive("O valor emprestado deve ser maior que zero").optional(),
  installments: z.coerce.number().int().min(1).max(48).default(1),
  firstDueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type LoanFields = z.infer<typeof loanSchema>;

/** null quando a despesa não foi emprestada. */
export function parseLoanFields(formData: FormData): LoanFields | null {
  if (formData.get("lent") !== "1") return null;
  const fields = loanSchema.parse({
    personId: formData.get("lentPersonId") || undefined,
    personName: formData.get("lentPersonName") || undefined,
    amount: formData.get("lentAmount") || undefined,
    installments: formData.get("lentInstallments") || 1,
    firstDueDate: formData.get("lentDueDate") || undefined,
  });
  if (!fields.personId && !fields.personName) throw new Error("Diga para quem foi emprestado");
  return fields;
}

type Link = { transactionId: string } | { cardPurchaseId: string };

/**
 * Cria, atualiza ou apaga o empréstimo ligado a uma despesa. Sem valor
 * informado, a pessoa deve a despesa inteira. Um nome novo vira uma pessoa.
 */
export async function syncLoan(
  tx: Prisma.TransactionClient,
  userId: string,
  link: Link,
  fields: LoanFields | null,
  expenseAmount: number,
) {
  if (!fields) {
    await tx.loan.deleteMany({ where: { userId, ...link } });
    return;
  }
  const amount = fields.amount ?? expenseAmount;
  if (amount > expenseAmount + 0.005) {
    throw new Error("O valor emprestado não pode passar do valor da despesa");
  }

  let personId = fields.personId;
  if (personId) {
    const person = await tx.person.findFirst({ where: { id: personId, userId } });
    if (!person) throw new Error("Pessoa não encontrada");
  } else {
    const name = fields.personName!;
    const person = await tx.person.upsert({
      where: { userId_name: { userId, name } },
      create: { userId, name },
      update: {},
    });
    personId = person.id;
  }

  const data = {
    personId,
    amount,
    installments: fields.installments,
    // Um dia de calendário em meia-noite UTC, como as outras datas do app.
    firstDueDate: fields.firstDueDate ? new Date(`${fields.firstDueDate}T00:00:00Z`) : null,
  };
  const existing = await tx.loan.findFirst({ where: { userId, ...link } });
  if (existing) {
    await tx.loan.update({ where: { id: existing.id }, data });
  } else {
    await tx.loan.create({ data: { userId, ...link, ...data } });
  }
}
