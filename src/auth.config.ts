import type { NextAuthConfig } from "next-auth";
import { NextResponse } from "next/server";
import { isPublicPath } from "@/lib/legal";

export const authConfig = {
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = nextUrl;

      // Landing, termos e política abrem sem conta: quem vai se cadastrar lê antes.
      if (isPublicPath(pathname)) return true;

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
