"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";

// `balance` é o valor absoluto: quem digita informa só o número, e o sinal vem
// do seletor.
const balanceSchema = z.object({
  // `""` viraria 0 no coerce, e zero é um saldo válido — então o vazio precisa
  // morrer antes da conversão, não depois.
  balance: z
    .string()
    .trim()
    .min(1, "Informe o saldo")
    // O parâmetro de tipo é o que o `pipe` exige: sem ele o coerce declara
    // entrada `unknown` e não encaixa na saída `string` do passo anterior.
    .pipe(z.coerce.number<string>().nonnegative("Valor não pode ser negativo")),
  sign: z.enum(["positivo", "negativo"]).default("positivo"),
});

/**
 * Grava uma leitura do extrato. Nunca atualiza a linha anterior: é a sequência
 * de ajustes que permite saber o que já estava contado em cada um.
 */
export async function setAccountBalance(formData: FormData) {
  const userId = await requireUserId();
  const data = balanceSchema.parse({
    balance: formData.get("balance") ?? "",
    sign: formData.get("sign") || undefined,
  });

  // Mesma convenção de transaction.ts, que guarda entrada avulsa como negativa:
  // o sinal é aplicado na hora de gravar, não digitado.
  const balance = data.sign === "negativo" ? -data.balance : data.balance;

  await prisma.balanceAdjustment.create({ data: { userId, balance } });
  revalidatePath("/");
}
