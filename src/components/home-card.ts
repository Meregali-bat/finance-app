import { cn } from "@/lib/utils";

/**
 * A superfície dos cards da Início: raio de 20px, o café do fundo e um anel
 * de 1px por sombra interna, que não ocupa espaço no layout.
 */
export function homeCard(className?: string) {
  return cn("rounded-[20px] bg-card p-[18px] shadow-(--shadow-card) lg:p-6", className);
}
