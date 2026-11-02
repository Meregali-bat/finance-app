"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { dateOnlyInputValue } from "@/lib/format";
import { Refusal, refusing } from "@/lib/action-result";
import { summarizeDebts } from "@/lib/loans";
import { storedDay } from "@/lib/period";

/**
 * O que o formulário de despesa precisa para o "Emprestado para alguém": as
 * pessoas já cadastradas e, na edição, os empréstimos da própria despesa —
 * um por pessoa, numa conta dividida.
 * Buscado ao abrir o formulário, para não ter de passar a lista por todas as
 * telas que abrem uma movimentação.
 */
export async function getLoanFormData(link?: {
  kind: "transaction" | "card";
  id: string;
}): Promise<{
  people: { id: string; name: string }[];
  loans: { personId: string; amount: number }[];
  installments: number;
  firstDueDate: string;
}> {
  const userId = await requireUserId();
  const [people, loans] = await Promise.all([
    prisma.person.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    link
      ? prisma.loan.findMany({
          where:
            link.kind === "card"
              ? { userId, cardPurchaseId: link.id }
              : { userId, transactionId: link.id },
          orderBy: { createdAt: "asc" },
        })
      : [],
  ]);
  return {
    people: people.map((p) => ({ id: p.id, name: p.name })),
    loans: loans.map((l) => ({ personId: l.personId, amount: Number(l.amount) })),
    // Gravadas iguais em todos; o primeiro responde por eles.
    installments: loans[0]?.installments ?? 1,
    firstDueDate: loans[0]?.firstDueDate ? dateOnlyInputValue(loans[0].firstDueDate) : "",
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

  const person = await prisma.person.findFirst({ where: { id: personId, userId } });
  if (!person) throw new Error("Pessoa não encontrada");
  // Pode passar do que a pessoa devia (arredondou para cima, pagou com
  // juros): o valor inteiro entra como receita, e a dívida fica quitada.

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

const forgiveSchema = z.object({ loanIds: z.array(z.string().min(1)).min(1).max(200) });

/**
 * Dá como perdido o que falta dos empréstimos escolhidos de uma pessoa: ela
 * não vai pagar. Sai do "A receber" e passa a contar como gasto seu (deixa de
 * ser emprestado). O que falta é o de agora, com os pagamentos dela já
 * abatidos do mais antigo para o mais novo. Devolve os ids para o "Desfazer".
 */
export async function forgiveLoans(personId: string, input: unknown) {
  return refusing(async () => {
    const userId = await requireUserId();
    const { loanIds } = forgiveSchema.parse(input);
    const person = await prisma.person.findFirst({
      where: { id: personId, userId },
      include: {
        loans: {
          include: {
            transaction: { select: { date: true } },
            cardPurchase: { select: { date: true } },
          },
        },
        repayments: { include: { transaction: { select: { amount: true } } } },
      },
    });
    if (!person) throw new Refusal("Pessoa não encontrada.");

    const [debt] = summarizeDebts({
      loans: person.loans.map((loan) => ({
        id: loan.id,
        personId,
        amount: Number(loan.amount),
        // A mesma ordem do "A receber" (loans-data): o dia da despesa.
        date: (() => {
          const source = loan.transaction ?? loan.cardPurchase;
          return source ? storedDay(source.date) : loan.createdAt;
        })(),
        installments: loan.installments,
        forgiven: Number(loan.forgiven),
      })),
      repayments: person.repayments.map((r) => ({
        personId,
        amount: -Number(r.transaction.amount),
      })),
      today: new Date(),
    });
    const wanted = new Set(loanIds);
    const open = (debt?.loans ?? []).filter((l) => wanted.has(l.id) && l.remaining > 0.005);
    if (open.length === 0) throw new Refusal("Esses empréstimos já não têm nada em aberto.");

    const now = new Date();
    const byId = new Map(person.loans.map((l) => [l.id, l]));
    await prisma.$transaction(
      open.map((l) =>
        prisma.loan.update({
          where: { id: l.id },
          data: {
            forgiven: Number(byId.get(l.id)!.forgiven) + l.remaining,
            forgivenAt: now,
          },
        }),
      ),
    );
    revalidatePath("/", "layout");
    return {
      loanIds: open.map((l) => l.id),
      amount: Math.round(open.reduce((sum, l) => sum + l.remaining, 0) * 100) / 100,
    };
  });
}

/** Desfaz o "não vai pagar": os empréstimos voltam a ser devidos por inteiro. */
export async function unforgiveLoans(input: unknown) {
  return refusing(async () => {
    const userId = await requireUserId();
    const { loanIds } = forgiveSchema.parse(input);
    await prisma.loan.updateMany({
      where: { userId, id: { in: loanIds } },
      data: { forgiven: 0, forgivenAt: null },
    });
    revalidatePath("/", "layout");
    return { ok: true as const };
  });
}
