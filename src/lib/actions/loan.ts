"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { dateOnlyInputValue } from "@/lib/format";

/**
 * O que o formulário de despesa precisa para o "Emprestado para alguém": as
 * pessoas já cadastradas e, na edição, o empréstimo da própria despesa.
 * Buscado ao abrir o formulário, para não ter de passar a lista por todas as
 * telas que abrem uma movimentação.
 */
export async function getLoanFormData(link?: {
  kind: "transaction" | "card";
  id: string;
}): Promise<{
  people: { id: string; name: string }[];
  loan: { personId: string; amount: number; installments: number; firstDueDate: string } | null;
}> {
  const userId = await requireUserId();
  const [people, loan] = await Promise.all([
    prisma.person.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    link
      ? prisma.loan.findFirst({
          where:
            link.kind === "card"
              ? { userId, cardPurchaseId: link.id }
              : { userId, transactionId: link.id },
        })
      : null,
  ]);
  return {
    people: people.map((p) => ({ id: p.id, name: p.name })),
    loan: loan
      ? {
          personId: loan.personId,
          amount: Number(loan.amount),
          installments: loan.installments,
          firstDueDate: loan.firstDueDate ? dateOnlyInputValue(loan.firstDueDate) : "",
        }
      : null,
  };
}

const repaymentSchema = z.object({
  amount: z.coerce.number().positive("Valor deve ser maior que zero"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
});

/**
 * Dinheiro que a pessoa devolveu. Vira uma receita comum ("Recebido de
 * João"), que entra no saldo e no orçamento do dia em que chegou, e abate os
 * empréstimos dela do mais antigo para o mais novo. O id da receita volta
 * para o "Desfazer": apagá-la desfaz o recebimento.
 */
export async function receiveLoanPayment(personId: string, formData: FormData) {
  const userId = await requireUserId();
  const data = repaymentSchema.parse({
    amount: formData.get("amount"),
    date: formData.get("date"),
  });

  const person = await prisma.person.findFirst({
    where: { id: personId, userId },
    include: {
      loans: { select: { amount: true } },
      repayments: { include: { transaction: { select: { amount: true } } } },
    },
  });
  if (!person) throw new Error("Pessoa não encontrada");
  const owed = person.loans.reduce((sum, l) => sum + Number(l.amount), 0);
  const paid = person.repayments.reduce((sum, r) => sum - Number(r.transaction.amount), 0);
  if (data.amount > owed - paid + 0.005) {
    throw new Error("O valor passa do que a pessoa ainda deve");
  }

  const transaction = await prisma.$transaction(async (tx) => {
    const created = await tx.transaction.create({
      data: {
        userId,
        description: `Recebido de ${person.name}`,
        // Receita: negativa no banco, como as outras.
        amount: -data.amount,
        date: new Date(`${data.date}T00:00:00Z`),
      },
      select: { id: true },
    });
    await tx.loanRepayment.create({
      data: { userId, personId, transactionId: created.id },
    });
    return created;
  });

  revalidatePath("/");
  revalidatePath("/historico");
  return { transactionId: transaction.id };
}
