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
  tone?: "solid" | "outline" | "ghost" | "cta";
  /**
   * md: 44px no celular, 42px no desktop. sm: 44px no celular, 38px no
   * desktop. lg: 44px sempre (a ação principal de uma tela). xl: 48px,
   * quadrado arredondado, ao lado de um botão principal da mesma altura.
   */
  size?: "md" | "sm" | "lg" | "xl" | "pill";
  className?: string;
} = {}) {
  return cn(
    "flex shrink-0 items-center justify-center rounded-full transition-[background-color,border-color,color,transform] duration-150 ease-out-quint outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.92] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
    size === "md" && "size-11 lg:size-[42px] [&_svg]:size-[18px]",
    size === "sm" && "size-11 lg:size-[38px] [&_svg]:size-[18px]",
    size === "lg" && "size-11 [&_svg]:size-5",
    size === "xl" && "size-12 rounded-2xl [&_svg]:size-5",
    // Ícone e texto: a ação que se repete em cada card e precisa se ler
    // sozinha (o "Pagar" e o "Adiar" dos lembretes). 44px de altura no celular.
    size === "pill" &&
      "h-11 gap-1.5 px-4 text-[13.5px] font-semibold lg:h-[38px] lg:px-3.5 [&_svg]:size-4",
    tone === "solid" && "bg-secondary text-foreground hover:bg-(--secondary-hover)",
    tone === "outline" &&
      "border border-(--hairline-strong) bg-(--field) text-foreground hover:border-primary/40",
    tone === "ghost" && "text-muted-foreground hover:bg-muted hover:text-foreground",
    tone === "cta" && "cta-surface text-white hover:-translate-y-px",
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
