"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { signIn } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_CATEGORIES } from "@/lib/default-categories";

export type SignUpState = {
  error?: string;
  field?: "email" | "password";
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
  });
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      error: issue.message,
      field: issue.path[0] === "password" ? "password" : "email",
      email,
    };
  }

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
    },
  });

  // Lança o redirect do Next — não pode ficar dentro de um try.
  await signIn("credentials", {
    email: parsed.data.email,
    password: parsed.data.password,
    redirectTo: "/comecar",
  });
  return null;
}
