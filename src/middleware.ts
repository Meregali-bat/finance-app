import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

export default NextAuth(authConfig).auth;

// Os ícones e o manifest ficam fora do login: o iPhone busca o ícone ao
// "adicionar à tela de início" sem passar pela sessão, e receber a tela de
// login no lugar da imagem deixava o atalho com um print da página.
// O /api/atalho também: quem chama é o app Atalhos, sem sessão, e ele se
// autentica pela chave pessoal (src/app/api/atalho/route.ts).
export const config = {
  matcher: [
    "/((?!api/auth|api/atalho|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|icons/).*)",
  ],
};
