import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

export default NextAuth(authConfig).auth;

// Os ícones e o manifest ficam fora do login: o iPhone busca o ícone ao
// "adicionar à tela de início" sem passar pela sessão, e receber a tela de
// login no lugar da imagem deixava o atalho com um print da página.
export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|icons/).*)",
  ],
};
