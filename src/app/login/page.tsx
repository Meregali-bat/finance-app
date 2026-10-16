import { AuthError } from "next-auth";
import { Check } from "lucide-react";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
    <div className="relative flex min-h-screen w-full items-center justify-center p-4">
      <div aria-hidden="true" className="app-backdrop" />
      <div className="flex w-full max-w-5xl flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex max-w-md flex-col gap-6">
          <span className="flex items-center gap-2.5">
            <span aria-hidden="true" className="size-2.5 rounded-full bg-primary" />
            <span className="font-heading font-semibold tracking-[-0.01em]">Finanças</span>
          </span>
          <h1 className="font-heading text-[2.5rem] leading-[1.05] font-semibold tracking-[-0.04em] lg:text-[3.5rem]">
            Saiba quanto você pode gastar <span className="text-primary">hoje.</span>
          </h1>
          <ul className="flex flex-col gap-3 text-sm text-muted-foreground">
            {[
              "Cada mês leva em conta o anterior",
              "Previsão dos próximos ciclos, com cartão e parcelas",
              "Contas a pagar, adiadas e vencidas num lugar só",
            ].map((line) => (
              <li key={line} className="flex items-center gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand/60 ring-1 ring-white/10">
                  <Check className="size-3.5 text-primary" aria-hidden="true" />
                </span>
                {line}
              </li>
            ))}
          </ul>
        </div>

        <Card variant="elevated" className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-2xl tracking-[-0.02em]">Entrar</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={authenticate} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" autoComplete="email" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-negative">
                  Email ou senha inválidos.
                </p>
              )}
              <Button type="submit" size="lg" className="mt-2 w-full">
                Entrar
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
