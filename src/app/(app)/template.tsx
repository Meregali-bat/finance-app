/**
 * Remontado a cada troca de tela (é o que um template faz, ao contrário do
 * layout): a tela nova entra subindo 10px. Trocar só a query — o período da
 * Previsão, o mês do Histórico — não remonta, e por isso não anima.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-in">{children}</div>;
}
