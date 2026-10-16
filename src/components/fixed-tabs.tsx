"use client";

import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = [
  { value: "rendas", label: "Rendas" },
  { value: "despesas", label: "Despesas" },
  { value: "categorias", label: "Categorias" },
] as const;

type Tab = (typeof TABS)[number]["value"];

/**
 * O cabeçalho e as abas dos Fixos. Ficam juntos porque o + do cabeçalho
 * segue a aba: "Nova renda", "Nova despesa" ou "Nova categoria". Os
 * diálogos e as listas chegam prontos do servidor.
 */
export function FixedTabs({
  actions,
  panels,
}: {
  actions: Record<Tab, React.ReactNode>;
  panels: Record<Tab, React.ReactNode>;
}) {
  const [tab, setTab] = useState<Tab>("rendas");

  return (
    <>
      <PageHeader title="Fixos" subtitle="O que se repete todo mês" action={actions[tab]} />
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as Tab)}
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
