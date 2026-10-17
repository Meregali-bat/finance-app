import { AuthError } from "next-auth";
import { Check } from "lucide-react";
import { Logo } from "@/components/logo";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { SubmitButton } from "./submit-button";

/** Os campos do login: 46px, raio 14, fundo escuro e anel rosé no foco. */
const FIELD =
  "h-[46px] rounded-[14px] border border-input bg-(--field) px-3.5 text-[15px] text-foreground outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground/60 focus:border-primary focus:shadow-[0_0_0_3px_rgb(242_169_159/0.2)]";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

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

        <form
          action={authenticate}
          className="rise-in flex flex-[0_1_380px] flex-col gap-4 rounded-3xl bg-card-elevated p-7 shadow-(--shadow-panel)"
          style={{ "--rise-delay": "150ms" } as React.CSSProperties}
        >
          <h2 className="font-heading text-[26px] font-bold tracking-[-0.03em]">Entrar</h2>
          <label className="flex flex-col gap-2 text-[13.5px] font-medium">
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              placeholder="voce@email.com"
              required
              className={FIELD}
            />
          </label>
          <label className="flex flex-col gap-2 text-[13.5px] font-medium">
            Senha
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className={FIELD}
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-negative">
              Email ou senha inválidos.
            </p>
          )}
          <SubmitButton />
        </form>
      </div>
    </div>
  );
}
