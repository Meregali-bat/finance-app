"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";

// Zero é um saldo legítimo (conta zerada), então a validação para em
// `nonnegative`. O campo vazio é barrado antes, pelo `required` do input.
const balanceSchema = z.object({
  balance: z.coerce.number().nonnegative("Valor não pode ser negativo"),
});

/**
 * Grava uma leitura do extrato. Nunca atualiza a linha anterior: é a sequência
 * de ajustes que permite saber o que já estava contado em cada um.
 */
export async function setAccountBalance(formData: FormData) {
  const userId = await requireUserId();
  const data = balanceSchema.parse({ balance: formData.get("balance") });

  await prisma.balanceAdjustment.create({ data: { userId, balance: data.balance } });
  revalidatePath("/");
}
