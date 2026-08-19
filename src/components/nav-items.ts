import { Home, TrendingUp, CreditCard, PiggyBank, ListChecks, History } from "lucide-react";

/**
 * As rotas da navegação principal, numa fonte única: a barra inferior (celular)
 * e a barra lateral (desktop) coexistem no DOM e precisam listar o mesmo.
 */
export const navItems = [
  { href: "/", label: "Início", icon: Home },
  { href: "/previsao", label: "Previsão", icon: TrendingUp },
  { href: "/cartoes", label: "Cartões", icon: CreditCard },
  { href: "/caixinhas", label: "Caixinhas", icon: PiggyBank },
  { href: "/rendas", label: "Fixos", icon: ListChecks },
  { href: "/historico", label: "Histórico", icon: History },
];

export function isNavItemActive(href: string, pathname: string) {
  // `/despesas` é uma aba de `/rendas`, não uma rota própria — mas se um link
  // apontar para lá, o item "Fixos" continua sendo o ativo.
  if (href === "/rendas") return pathname === "/rendas" || pathname === "/despesas";
  return pathname === href;
}
