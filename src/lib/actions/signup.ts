"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { z } from "zod";
import { redirect } from "next/navigation";
import { signIn, TooManyAttempts } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_CATEGORIES } from "@/lib/default-categories";
import { clientIp, rateLimitMessage, reserveAttempt, signupRules } from "@/lib/auth-rate-limit";
import { prismaAttemptStore } from "@/lib/auth-rate-limit-store";
import { LEGAL_VERSION } from "@/lib/legal";

export type SignUpState = {
  error?: string;
  field?: "email" | "password" | "accept";
  /** Devolvido para o campo não esvaziar a cada erro. */
  email?: string;
} | null;

const MIN_PASSWORD = 8;

const signUpSchema = z.object({
  email: z.string().trim().toLowerCase().email("Esse email não parece completo."),
  password: z
    .string()
    .min(MIN_PASSWORD, `A senha precisa de pelo menos ${MIN_PASSWORD} caracteres.`)
    .max(200),
  // O aceite dos termos e da política: sem ele, não há conta. O servidor
  // confere, porque o `required` do navegador se contorna com um POST direto.
  accept: z.literal("on", "Para criar a conta, aceite os termos de uso e a política de privacidade."),
});

/**
 * Cria a conta e já entra nela, levando ao primeiro uso. O erro volta como
 * estado (e não lançado): no site publicado o Next esconde a mensagem de um
 * erro lançado no servidor, e "esse email já tem conta" precisa chegar inteiro.
 */
export async function signUp(_prev: SignUpState, formData: FormData): Promise<SignUpState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
    accept: formData.get("accept") ?? "",
  });
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      error: issue.message,
      field: issue.path[0] === "password" ? "password" : issue.path[0] === "accept" ? "accept" : "email",
      email,
    };
  }

  // Conta toda tentativa que passou da validação, deu certo ou não: o limite
  // é para criar contas em lote e para testar quais e-mails já têm conta.
  const ip = clientIp(await headers());
  const attempt = await reserveAttempt(prismaAttemptStore, signupRules(parsed.data.email, ip));
  if (!attempt.ok) return { error: rateLimitMessage(attempt.minutes), field: "email", email };

  const existing = await prisma.user.findFirst({
    where: { email: { equals: parsed.data.email, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) {
    return { error: "Já existe uma conta com esse email.", field: "email", email };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.create({
    data: {
      email: parsed.data.email,
      passwordHash,
      categories: { create: DEFAULT_CATEGORIES.map((name) => ({ name })) },
      // Quando e qual versão foi aceita, na mesma escrita da conta.
      consents: { create: { kind: "terms", version: LEGAL_VERSION } },
    },
  });

  // O signIn lança o redirect do Next: o catch só trata o limite e devolve o
  // resto. Com o IP travado no login (muitas senhas erradas de outras contas),
  // a conta já foi criada mas não entra; vai para o login com o aviso, em vez
  // de uma tela de erro.
  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/comecar",
    });
  } catch (err) {
    if (err instanceof TooManyAttempts) redirect(`/login?error=limite&min=${err.minutes}`);
    throw err;
  }
  return null;
}
