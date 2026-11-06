import type { NextAuthConfig } from "next-auth";
import { NextResponse } from "next/server";

/**
 * Páginas que qualquer pessoa abre sem conta: a landing e as páginas legais,
 * que a landing e o cadastro linkam.
 */
const PUBLIC_PATHS = new Set(["/conheca", "/privacidade", "/termos"]);

export const authConfig = {
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = nextUrl;

      if (PUBLIC_PATHS.has(pathname)) return true;

      // Quem chega sem conta pelo endereço do app vê a landing, no mesmo
      // endereço; logado, o "/" continua sendo a tela inicial do app.
      if (!isLoggedIn && pathname === "/") {
        return NextResponse.rewrite(new URL("/conheca", nextUrl));
      }

      const isLoginPage = pathname === "/login";
      if (!isLoggedIn && !isLoginPage) return false;
      if (isLoggedIn && isLoginPage) {
        return Response.redirect(new URL("/", nextUrl));
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
