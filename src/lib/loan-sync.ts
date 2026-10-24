import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Os campos "Emprestado para alguém" dos formulários de despesa, e o que
 * fazer com eles ao salvar. Fica fora dos arquivos de action porque é chamado
 * de dentro deles, na mesma transação da despesa.
 *
 * Uma conta dividida pode ter várias pessoas: cada uma vem numa linha
 * numerada do formulário (`lent.0.personId`, `lent.1.personName`…), com a
 * própria parte. As parcelas e a data combinada valem para todas.
 */
const personSchema = z.object({
  personId: z.string().trim().optional(),
  personName: z.string().trim().max(60).optional(),
  amount: z.coerce.number().positive("O valor emprestado deve ser maior que zero").optional(),
  // A parte da despesa que a pessoa deve (0,5 = metade), quando escolhida por
  // atalho: a conta sai do valor da despesa aqui, e não do que a tela calculou.
  share: z.coerce.number().gt(0).max(1).optional(),
});

const loanSchema = z.object({
  people: z.array(personSchema).min(1, "Diga para quem foi emprestado").max(20),
  installments: z.coerce.number().int().min(1).max(48).default(1),
  firstDueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type LoanPerson = z.infer<typeof personSchema>;
export type LoanFields = z.infer<typeof loanSchema>;

/** As linhas de pessoa que o formulário mandou, na ordem da tela. */
function personRows(formData: FormData) {
  const rows: Record<string, FormDataEntryValue | undefined>[] = [];
  for (let i = 0; i < 20; i++) {
    const key = (field: string) => formData.get(`lent.${i}.${field}`) ?? undefined;
    if (key("personId") === undefined && key("personName") === undefined) break;
    rows.push({
      personId: key("personId") || undefined,
      personName: key("personName") || undefined,
      amount: key("amount") || undefined,
      share: key("share") || undefined,
    });
  }
  return rows;
}

/** null quando a despesa não foi emprestada. */
export function parseLoanFields(formData: FormData): LoanFields | null {
  if (formData.get("lent") !== "1") return null;
  const fields = loanSchema.parse({
    people: personRows(formData),
    installments: formData.get("lentInstallments") || 1,
    firstDueDate: formData.get("lentDueDate") || undefined,
  });
  for (const p of fields.people) {
    if (!p.personId && !p.personName) throw new Error("Diga para quem foi emprestado");
  }
  const keys = fields.people.map((p) => p.personId ?? `name:${p.personName!.toLowerCase()}`);
  if (new Set(keys).size !== keys.length) {
    throw new Error("A mesma pessoa aparece duas vezes");
  }
  return fields;
}

type Link = { transactionId: string } | { cardPurchaseId: string };

function cents(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Quanto a pessoa deve: o valor digitado; senão a parte escolhida (metade, um
 * terço) do valor da despesa, em centavos; senão a despesa inteira.
 */
export function loanAmount(
  fields: Pick<LoanPerson, "amount" | "share">,
  expenseAmount: number,
): number {
  if (fields.amount != null) return fields.amount;
  if (fields.share != null) return cents(expenseAmount * fields.share);
  return expenseAmount;
}

/**
 * Quanto cada pessoa deve. Quando as partes fecham a despesa inteira (R$ 100
 * entre três que não comeram com você), o centavo que o arredondamento perde
 * fica com a última pessoa, para a soma bater com a despesa.
 */
export function loanAmounts(people: Pick<LoanPerson, "amount" | "share">[], expenseAmount: number) {
  const amounts = people.map((p) => loanAmount(p, expenseAmount));
  const shares = people.map((p) => (p.amount == null ? p.share : undefined));
  if (shares.every((s) => s != null)) {
    const sum = shares.reduce((t, s) => t + s!, 0);
    if (Math.abs(sum - 1) < 1e-6) {
      const rest = cents(expenseAmount - amounts.reduce((t, a) => t + a, 0));
      amounts[amounts.length - 1] = cents(amounts[amounts.length - 1] + rest);
    }
  }
  return amounts;
}

/**
 * Deixa os empréstimos ligados a uma despesa como o formulário mandou: cria os
 * das pessoas novas, atualiza os de quem continua e apaga os de quem saiu.
 * Atualizar em vez de recriar mantém a data de cada um, que decide a ordem em
 * que os pagamentos da pessoa os abatem. Um nome novo vira uma pessoa.
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
  const amounts = loanAmounts(fields.people, expenseAmount);
  const total = amounts.reduce((t, a) => t + a, 0);
  if (total > expenseAmount + 0.005) {
    throw new Error("O valor emprestado não pode passar do valor da despesa");
  }

  const personIds: string[] = [];
  for (const p of fields.people) {
    if (p.personId) {
      const person = await tx.person.findFirst({ where: { id: p.personId, userId } });
      if (!person) throw new Error("Pessoa não encontrada");
      personIds.push(person.id);
    } else {
      const name = p.personName!;
      const person = await tx.person.upsert({
        where: { userId_name: { userId, name } },
        create: { userId, name },
        update: {},
      });
      personIds.push(person.id);
    }
  }
  if (new Set(personIds).size !== personIds.length) {
    throw new Error("A mesma pessoa aparece duas vezes");
  }

  const shared = {
    installments: fields.installments,
    // Um dia de calendário em meia-noite UTC, como as outras datas do app.
    firstDueDate: fields.firstDueDate ? new Date(`${fields.firstDueDate}T00:00:00Z`) : null,
  };
  const existing = await tx.loan.findMany({ where: { userId, ...link } });
  const gone = existing.filter((l) => !personIds.includes(l.personId)).map((l) => l.id);
  if (gone.length > 0) await tx.loan.deleteMany({ where: { id: { in: gone } } });
  // O banco daria a mesma hora a todos os criados nesta transação; um
  // milissegundo de diferença guarda a ordem em que vieram na tela.
  const now = Date.now();
  for (const [i, personId] of personIds.entries()) {
    const data = { personId, amount: amounts[i], ...shared };
    const current = existing.find((l) => l.personId === personId);
    if (current) {
      await tx.loan.update({ where: { id: current.id }, data });
    } else {
      await tx.loan.create({ data: { userId, ...link, ...data, createdAt: new Date(now + i) } });
    }
  }
}
