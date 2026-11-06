import type { NextAuthConfig } from "next-auth";
import { isPublicPath } from "@/lib/legal";

export const authConfig = {
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isLoginPage = nextUrl.pathname === "/login";
      // Termos e política abrem sem conta: quem vai se cadastrar lê antes.
      if (isPublicPath(nextUrl.pathname)) return true;

      if (!isLoggedIn && !isLoginPage) return false;
      if (isLoggedIn && isLoginPage) {
        return Response.redirect(new URL("/", nextUrl));
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
