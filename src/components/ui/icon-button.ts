import { cn } from "@/lib/utils";

/**
 * Os botões-ícone redondos da Início. Só classes, e não um componente: eles
 * entram como `render` dos `DialogTrigger`, que precisam receber o elemento.
 *
 * - `solid`: a ação principal do card (corrigir saldo, marcar como paga).
 * - `outline`: a secundária (simular uma compra).
 * - `ghost`: a que fica de lado (adiar).
 *
 * O tamanho mínimo de toque no celular é 44px; no desktop o handoff afina.
 */
export function iconButton({
  tone = "solid",
  size = "md",
  className,
}: {
  tone?: "solid" | "outline" | "ghost";
  /** md: 44px no celular, 42px no desktop. sm: 44px no celular, 38px no desktop. */
  size?: "md" | "sm";
  className?: string;
} = {}) {
  return cn(
    "flex shrink-0 items-center justify-center rounded-full transition-[background-color,border-color,color,transform] duration-150 ease-out-quint outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.92] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
    size === "md"
      ? "size-11 lg:size-[42px] [&_svg]:size-[18px]"
      : "size-11 lg:size-[38px] [&_svg]:size-[18px]",
    tone === "solid" && "bg-secondary text-foreground hover:bg-(--rich-mahogany-3)",
    tone === "outline" &&
      "border border-[rgb(255_236_233/0.14)] bg-[rgb(255_236_233/0.04)] text-foreground hover:border-[rgb(242_169_159/0.4)]",
    tone === "ghost" && "text-muted-foreground hover:bg-muted hover:text-foreground",
    className,
  );
}

/**
 * Um gatilho de diálogo em ícone, no lugar do botão com texto. O rótulo vira
 * `aria-label` e `title`: sem texto visível, é o que leitores de tela e o
 * ponteiro mostram.
 */
export interface IconTrigger {
  className: string;
  label: string;
  icon: React.ReactNode;
}
