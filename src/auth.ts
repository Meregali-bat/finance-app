import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";
import { clientIp, guardLogin } from "@/lib/auth-rate-limit";
import { prismaAttemptStore } from "@/lib/auth-rate-limit-store";

/**
 * Muitas senhas erradas: o login recusa sem nem checar a senha. Quanto falta
 * vai para a tela de login pelo `authenticate`.
 */
export class TooManyAttempts extends CredentialsSignin {
  code = "limite";
  constructor(readonly minutes: number) {
    super(`Limite de tentativas de login: libera em ${minutes} min`);
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      // O limite fica aqui, e não na action da tela: /api/auth/callback/credentials
      // chama este authorize direto, sem passar por ela.
      authorize: async (credentials, request) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const guarded = await guardLogin(prismaAttemptStore, email, clientIp(request.headers), async () => {
          // Sem diferença de maiúsculas e espaços: "Fulano@Email.com " é a
          // mesma conta que "fulano@email.com".
          const user = await prisma.user.findFirst({
            where: { email: { equals: email.trim(), mode: "insensitive" } },
          });
          if (!user) return null;

          const valid = await bcrypt.compare(password, user.passwordHash);
          if (!valid) return null;

          return { id: user.id, email: user.email };
        });
        if (guarded.limited) throw new TooManyAttempts(guarded.minutes);
        return guarded.result;
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user) session.user.id = token.id as string;
      return session;
    },
  },
});
