import Link from "next/link";
import { Logo } from "@/components/logo";

/**
 * Termos e política: abrem sem conta (src/lib/legal.ts, PUBLIC_PATHS), fora
 * da navegação do app. Uma coluna de leitura, com a marca levando ao início.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen w-full flex-col items-center px-4 pt-[max(1.5rem,calc(env(safe-area-inset-top)+1rem))] pb-16">
      <div aria-hidden="true" className="app-backdrop" />
      <div className="flex w-full max-w-[44rem] flex-col gap-8">
        <Link href="/" aria-label="Leeway, início" className="self-start">
          <Logo size="sm" />
        </Link>
        <article className="legal-text flex flex-col gap-5 rounded-[22px] bg-card p-5 text-[15px] leading-relaxed shadow-(--shadow-card) lg:p-8">
          {children}
        </article>
        <nav aria-label="Documentos" className="flex flex-wrap gap-4 text-[13.5px] text-muted-foreground">
          <Link href="/privacidade" className="underline underline-offset-2 hover:text-foreground">
            Política de privacidade
          </Link>
          <Link href="/termos" className="underline underline-offset-2 hover:text-foreground">
            Termos de uso
          </Link>
        </nav>
      </div>
    </div>
  );
}
