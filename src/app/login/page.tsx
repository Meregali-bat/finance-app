import { AuthError } from "next-auth";
import { Check } from "lucide-react";
import { Logo } from "@/components/logo";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import Link from "next/link";
import { SubmitButton } from "./submit-button";
import { FIELD } from "./field";
import { PasswordInput } from "./password-input";
import { SignUpForm } from "./sign-up-form";
import { cn } from "@/lib/utils";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; modo?: string }>;
}) {
  const { error, modo } = await searchParams;
  const creating = modo === "criar";

  async function authenticate(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirectTo: "/",
      });
    } catch (err) {
      if (err instanceof AuthError) {
        redirect("/login?error=1");
      }
      throw err;
    }
  }

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-5 pt-[max(2rem,calc(env(safe-area-inset-top)+1rem))] pb-8">
      <div aria-hidden="true" className="app-backdrop" />
      {/* Duas colunas que quebram sozinhas quando não cabem. */}
      <div className="flex w-full max-w-[1000px] flex-wrap items-center justify-between gap-12">
        <div className="rise-in flex max-w-[480px] flex-[1_1_380px] flex-col gap-7">
          <Logo size="lg" />
          <h1 className="font-heading text-[clamp(40px,6vw,60px)] leading-none font-bold tracking-[-0.045em] text-balance">
            Saiba quanto você pode gastar <span className="text-primary">hoje.</span>
          </h1>
          <ul className="flex flex-col gap-3 text-[14.5px] text-muted-foreground">
            {[
              "Cada mês leva em conta o anterior",
              "Previsão dos próximos ciclos, com cartão e parcelas",
              "Contas a pagar, adiadas e vencidas num lugar só",
            ].map((line, index) => (
              <li
                key={line}
                className="slide-in flex items-center gap-3"
                style={{ "--rise-delay": `${500 + index * 120}ms` } as React.CSSProperties}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                  <Check className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
                </span>
                {line}
              </li>
            ))}
          </ul>
        </div>

        <div
          className="rise-in flex flex-[0_1_380px] flex-col gap-5 rounded-3xl bg-card-elevated p-7 shadow-(--shadow-panel)"
          style={{ "--rise-delay": "150ms" } as React.CSSProperties}
        >
          {/* Entrar e criar conta no mesmo cartão: a pessoa não precisa achar
              outra página, e o link é compartilhável (?modo=criar). */}
          <nav
            aria-label="Entrar ou criar conta"
            className="grid grid-cols-2 rounded-[14px] bg-card p-1 shadow-[inset_0_0_0_1px_var(--hairline)]"
          >
            {[
              { href: "/login", label: "Entrar", active: !creating },
              { href: "/login?modo=criar", label: "Criar conta", active: creating },
            ].map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={tab.active ? "page" : undefined}
                className={cn(
                  "flex h-[38px] items-center justify-center rounded-[10px] text-[13.5px] font-semibold transition-colors",
                  tab.active
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            ))}
          </nav>

          <h2 className="font-heading text-[26px] leading-tight font-bold tracking-[-0.03em]">
            {creating ? "Criar conta" : "Entrar"}
          </h2>

          {creating ? (
            <SignUpForm />
          ) : (
            <form action={authenticate} className="flex flex-col gap-4">
              <label className="flex flex-col gap-2 text-[13.5px] font-medium">
                Email
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="voce@email.com"
                  required
                  className={FIELD}
                />
              </label>
              <label className="flex flex-col gap-2 text-[13.5px] font-medium">
                Senha
                <PasswordInput autoComplete="current-password" invalid={!!error} />
              </label>
              {error && (
                <p role="alert" className="text-sm text-negative">
                  Email ou senha não conferem.
                </p>
              )}
              <SubmitButton />
              {/* Sem envio de email ainda: a senha só é redefinida à mão. */}
              <p className="text-center text-[13px] text-muted-foreground">
                Esqueceu a senha? Peça para quem administra o app redefinir.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
