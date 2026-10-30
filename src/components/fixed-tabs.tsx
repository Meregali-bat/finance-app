"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = [
  { value: "rendas", label: "Rendas", subtitle: "O que entra todo mês" },
  { value: "despesas", label: "Despesas", subtitle: "O que sai todo mês" },
  { value: "categorias", label: "Categorias", subtitle: "Como os gastos se agrupam" },
] as const;

export type FixedTab = (typeof TABS)[number]["value"];
type Tab = FixedTab;

/**
 * O cabeçalho e as abas dos Fixos. Ficam juntos porque o + do cabeçalho
 * segue a aba: "Nova renda", "Nova despesa" ou "Nova categoria". Os
 * diálogos e as listas chegam prontos do servidor.
 */
export function FixedTabs({
  actions,
  panels,
  initialTab = "rendas",
  summary,
}: {
  actions: Record<Tab, React.ReactNode>;
  panels: Record<Tab, React.ReactNode>;
  /** A aba de chegada: a Previsão abre direto em Despesas (`?aba=despesas`). */
  initialTab?: Tab;
  /** O mês fixo somado, entre o cabeçalho e as abas. */
  summary?: React.ReactNode;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const pathname = usePathname();

  // A aba vai para a URL: recarregar ou voltar não cai de novo em Rendas. Pelo
  // History nativo, que o roteador acompanha sem buscar a página de novo.
  function choose(next: Tab) {
    setTab(next);
    window.history.replaceState(null, "", next === "rendas" ? pathname : `${pathname}?aba=${next}`);
  }

  return (
    <>
      <PageHeader
        title="Fixos"
        subtitle={TABS.find((t) => t.value === tab)?.subtitle}
        action={actions[tab]}
      />
      {/* O resumo é de dinheiro: nas categorias ele só empurrava a lista. */}
      {tab !== "categorias" && summary}
      <Tabs
        value={tab}
        onValueChange={(value) => choose(value as Tab)}
        className="rise-in gap-4"
        style={{ "--rise-delay": "60ms" } as React.CSSProperties}
      >
        <TabsList className="w-full lg:w-fit">
          {TABS.map((item) => (
            <TabsTrigger key={item.value} value={item.value} className="flex-1 lg:flex-none">
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((item) => (
          <TabsContent key={item.value} value={item.value}>
            {panels[item.value]}
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}
