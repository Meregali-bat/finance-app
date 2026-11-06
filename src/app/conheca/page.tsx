import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CalendarRange, CreditCard, FileText, Smartphone, Wallet } from "lucide-react";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PLANO } from "./plano";
import appCelular from "./app-celular.png";

export const metadata: Metadata = {
  title: "Leeway: quanto você pode gastar hoje",
  description:
    "Um número por dia, honesto até o próximo pagamento: já desconta contas fixas, faturas do cartão e o que vai faltar nos meses seguintes.",
};

/**
 * A porta de entrada de quem não tem conta. O middleware serve esta página
 * no lugar do "/" para visitantes (src/auth.config.ts); quem está logado vai
 * direto para o app.
 */

const COMO_FUNCIONA = [
  {
    icon: CalendarRange,
    title: "O mês vai de um pagamento ao próximo",
    text: "Não do dia 1 ao 30. Você informa quando recebe, e o número do dia é o que sobra até lá, dividido pelos dias que faltam.",
  },
  {
    icon: CreditCard,
    title: "Contas e cartão já saem antes",
    text: "Despesas fixas, parcelas e a fatura que fecha neste ciclo são descontadas antes de virar dinheiro livre.",
  },
  {
    icon: Wallet,
    title: "O que falta adiante também conta",
    text: "Se um mês à frente não vai fechar, o app reserva hoje a diferença. Sobrou ou faltou? Passa para o período seguinte.",
  },
];

const BANCOS = [
  {
    icon: Wallet,
    title: "Qualquer banco",
    text: "Você lança gastos, contas e cartões à mão, em poucos toques. Não pedimos a senha do seu banco e não nos conectamos à sua conta.",
  },
  {
    icon: Smartphone,
    title: "Atalho do iPhone",
    text: "Pagou por aproximação com a Carteira do iPhone? O gasto entra sozinho, com qualquer cartão cadastrado nela.",
  },
  {
    icon: FileText,
    title: "Importar extrato em PDF",
    text: "Extrato da conta do Nubank, Sicoob e Banrisul, e fatura do cartão Sicoob e Banrisul. Outros bancos entram conforme houver pedido.",
  },
];

function precoMensal() {
  if (PLANO.mensal === null) return null;
  return formatCurrency(PLANO.mensal);
}

export default function LandingPage() {
  const mensal = precoMensal();
  const ctaClass = cn(buttonVariants({ size: "lg" }), "h-12 px-6 text-[15px] font-semibold");

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden">
      <div aria-hidden="true" className="app-backdrop" />

      <header className="mx-auto flex w-full max-w-[1080px] items-center justify-between px-5 pt-[max(1.25rem,calc(env(safe-area-inset-top)+0.75rem))] pb-4 lg:px-8">
        <Logo size="md" />
        <nav aria-label="Conta" className="flex items-center gap-1.5">
          <Link
            href="/login"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-[14px] font-semibold")}
          >
            Entrar
          </Link>
          <Link
            href="/login?modo=criar"
            className={cn(buttonVariants({ size: "sm" }), "px-4 text-[14px] font-semibold")}
          >
            Criar conta
          </Link>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-[1080px] flex-col gap-24 px-5 pt-8 pb-16 lg:gap-32 lg:px-8 lg:pt-14">
        {/* A promessa, e o app mostrando ela. */}
        <section className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <div className="rise-in flex flex-col gap-6">
            <h1 className="font-heading text-[clamp(40px,7vw,68px)] leading-[0.98] font-bold tracking-[-0.045em] text-balance">
              Quanto você pode gastar <span className="text-primary">hoje?</span>
            </h1>
            <p className="max-w-[34rem] text-[17px] leading-relaxed text-muted-foreground text-pretty">
              O Leeway responde com um número por dia, honesto até o seu próximo pagamento. Ele já
              desconta as contas fixas, a fatura do cartão e o que vai faltar nos meses seguintes,
              para você decidir um gasto sem descobrir depois que não dava.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/login?modo=criar" className={ctaClass}>
                Criar minha conta
              </Link>
              <a
                href="#preco"
                className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "h-12 text-[15px]")}
              >
                Ver o preço
              </a>
            </div>
          </div>

          <div
            className="rise-in relative mx-auto w-full max-w-[340px]"
            style={{ "--rise-delay": "150ms" } as React.CSSProperties}
          >
            <div
              aria-hidden="true"
              className="absolute inset-x-[-15%] top-[10%] bottom-[5%] -z-10 rounded-full bg-primary/15 blur-3xl"
            />
            <Image
              src={appCelular}
              alt="A tela inicial do Leeway no celular, com o valor que dá para gastar hoje e quanto sobra até o próximo pagamento."
              priority
              sizes="(min-width: 1024px) 340px, 80vw"
              className="h-auto w-full rounded-[2.25rem] shadow-(--shadow-panel) ring-1 ring-border"
            />
            <p className="mt-3 text-center text-[12.5px] text-muted-foreground">
              Tela real do app, com dados de exemplo.
            </p>
          </div>
        </section>

        <section aria-labelledby="como-funciona" className="flex flex-col gap-8">
          <h2
            id="como-funciona"
            className="font-heading text-[clamp(28px,4vw,40px)] leading-tight font-bold tracking-[-0.035em] text-balance"
          >
            Diferente de anotar o que já saiu
          </h2>
          <ul className="grid gap-4 md:grid-cols-3">
            {COMO_FUNCIONA.map(({ icon: Icon, title, text }) => (
              <li
                key={title}
                className="flex flex-col gap-3 rounded-3xl bg-card p-6 shadow-(--shadow-card)"
              >
                <span className="flex size-10 items-center justify-center rounded-full bg-primary/12 text-primary">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="font-heading text-[19px] leading-snug font-semibold tracking-[-0.02em]">
                  {title}
                </h3>
                <p className="text-[14.5px] leading-relaxed text-muted-foreground">{text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="bancos" className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <h2
              id="bancos"
              className="font-heading text-[clamp(28px,4vw,40px)] leading-tight font-bold tracking-[-0.035em] text-balance"
            >
              Quais bancos funcionam
            </h2>
            <p className="max-w-[40rem] text-[15.5px] leading-relaxed text-muted-foreground">
              Todos, porque o Leeway não depende do banco. O que muda é quanto entra sozinho.
            </p>
          </div>
          <ul className="grid gap-4 md:grid-cols-3">
            {BANCOS.map(({ icon: Icon, title, text }) => (
              <li
                key={title}
                className="flex flex-col gap-3 rounded-3xl bg-card p-6 shadow-(--shadow-card)"
              >
                <span className="flex size-10 items-center justify-center rounded-full bg-primary/12 text-primary">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="font-heading text-[19px] leading-snug font-semibold tracking-[-0.02em]">
                  {title}
                </h3>
                <p className="text-[14.5px] leading-relaxed text-muted-foreground">{text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section
          id="preco"
          aria-labelledby="preco-titulo"
          className="mx-auto flex w-full max-w-[560px] scroll-mt-8 flex-col items-center gap-5 rounded-3xl bg-card-elevated p-8 text-center shadow-(--shadow-panel) lg:p-10"
        >
          <h2
            id="preco-titulo"
            className="font-heading text-[clamp(26px,3.5vw,34px)] leading-tight font-bold tracking-[-0.035em]"
          >
            Uma assinatura, o app inteiro
          </h2>
          {mensal ? (
            <p className="flex items-baseline gap-1.5">
              <span className="font-heading text-[44px] leading-none font-bold tracking-[-0.04em]">
                {mensal}
              </span>
              <span className="text-[15px] text-muted-foreground">por mês</span>
            </p>
          ) : (
            <p className="font-heading text-[28px] leading-none font-bold tracking-[-0.03em] text-primary">
              Preço em breve
            </p>
          )}
          {PLANO.anual !== null && (
            <p className="text-[14.5px] text-muted-foreground">
              ou {formatCurrency(PLANO.anual)} por ano
            </p>
          )}
          <p className="max-w-[26rem] text-[14.5px] leading-relaxed text-muted-foreground">
            {PLANO.diasDeTeste
              ? `Os primeiros ${PLANO.diasDeTeste} dias são grátis. Sem plano limitado: a assinatura dá acesso a tudo, incluindo previsão, cartões, importação de extrato e avisos no celular.`
              : "Sem plano limitado: a assinatura dá acesso a tudo, incluindo previsão, cartões, importação de extrato e avisos no celular."}
          </p>
          <Link href="/login?modo=criar" className={ctaClass}>
            Criar minha conta
          </Link>
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-[1080px] flex-col items-center justify-between gap-4 border-t border-border px-5 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] text-[13.5px] text-muted-foreground sm:flex-row lg:px-8">
        <Logo size="sm" />
        <nav aria-label="Informações legais" className="flex items-center gap-5">
          <Link href="/privacidade" className="hover:text-foreground">
            Política de privacidade
          </Link>
          <Link href="/termos" className="hover:text-foreground">
            Termos de uso
          </Link>
        </nav>
      </footer>
    </div>
  );
}
