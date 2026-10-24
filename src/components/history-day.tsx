"use client";

import { createContext, useContext, useState } from "react";

/**
 * O dia escolhido no calendário do Histórico, para a listagem filtrar por ele.
 * Os dois ficam em partes diferentes da página e só se falam por aqui.
 */
const HistoryDayContext = createContext<{
  day: string | null;
  setDay: (day: string | null) => void;
} | null>(null);

export function HistoryDayProvider({ children }: { children: React.ReactNode }) {
  const [day, setDay] = useState<string | null>(null);
  return <HistoryDayContext value={{ day, setDay }}>{children}</HistoryDayContext>;
}

/** Fora do provedor (em outra tela), não há dia escolhido e escolher não faz nada. */
export function useHistoryDay() {
  return useContext(HistoryDayContext) ?? { day: null, setDay: () => {} };
}
