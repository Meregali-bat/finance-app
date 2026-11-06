import { CONTROLLER, TO_FILL } from "@/lib/legal";

/** Partes comuns das páginas de termos e de privacidade. */

export function DraftNotice() {
  return (
    <p
      role="note"
      className="rounded-[14px] border border-negative/40 bg-negative/8 p-3.5 text-[13.5px] leading-snug"
    >
      <strong>Rascunho.</strong> Este texto ainda não passou por revisão jurídica e pode mudar
      antes de o Leeway abrir para o público. Os trechos marcados com {TO_FILL} ainda não foram
      definidos.
    </p>
  );
}

export function DocHeader({ title, version }: { title: string; version: string }) {
  const [y, m, d] = version.split("-");
  return (
    <header className="flex flex-col gap-1">
      <h1 className="font-heading text-[30px] leading-tight font-bold tracking-[-0.035em]">{title}</h1>
      <p className="text-[13.5px] text-muted-foreground">
        Versão de {d}/{m}/{y}
      </p>
    </header>
  );
}

export function H2({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mt-3 scroll-mt-6 font-heading text-[20px] leading-tight font-bold tracking-[-0.02em]">
      {children}
    </h2>
  );
}

export function List({ children }: { children: React.ReactNode }) {
  return <ul className="flex list-disc flex-col gap-1.5 pl-5">{children}</ul>;
}

export function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
      {children}
    </a>
  );
}

/** O contato de privacidade, ou o marcador enquanto não for definido. */
export function ContactEmail() {
  return CONTROLLER.email ? (
    <a href={`mailto:${CONTROLLER.email}`} className="font-semibold underline underline-offset-2">
      {CONTROLLER.email}
    </a>
  ) : (
    <strong>{TO_FILL}</strong>
  );
}

export const LGPD_URL = "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm";
export const CDC_URL = "https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm";
