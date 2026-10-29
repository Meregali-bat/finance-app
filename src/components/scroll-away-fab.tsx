"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Quanto rolar, de uma vez, antes de mudar de estado: ignora o tremor do dedo. */
const THRESHOLD = 8;
/** Perto do topo ou do fim da página, o botão sempre aparece. */
const EDGE = 24;

/**
 * O "+" fixo do celular recolhe ao rolar para baixo — senão ele cobre o
 * "Pagar" dos lembretes, que fica à direita — e volta ao rolar para cima, no
 * topo e no fim da página. Nunca some com o foco dentro nem com o diálogo
 * aberto, e continua na ordem do Tab. Em `lg` o botão está no cabeçalho, e as
 * classes de recolher só valem abaixo disso.
 */
export function ScrollAwayFab({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    let frame = 0;

    // Foco dentro (Tab ou a volta do diálogo) ou diálogo aberto: o gatilho do
    // Base UI marca `data-popup-open` enquanto o diálogo está aberto.
    const pinned = () => {
      const el = ref.current;
      if (!el) return false;
      return el.contains(document.activeElement) || el.querySelector("[data-popup-open]") !== null;
    };

    const update = () => {
      frame = 0;
      const y = window.scrollY;
      const atEdge =
        y <= EDGE ||
        y + window.innerHeight >= document.documentElement.scrollHeight - EDGE;
      if (atEdge || pinned()) {
        lastY = y;
        setHidden(false);
        return;
      }
      const delta = y - lastY;
      if (Math.abs(delta) < THRESHOLD) return;
      lastY = y;
      setHidden(delta > 0);
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={ref}
      // O toast de desfazer procura isto para subir acima do botão no celular.
      data-fab=""
      data-hidden={hidden || undefined}
      onFocus={() => setHidden(false)}
      className={cn(
        "transition-[opacity,scale,translate] duration-180 ease-out-quint motion-reduce:transition-none",
        "max-lg:data-hidden:pointer-events-none max-lg:data-hidden:translate-y-3 max-lg:data-hidden:scale-75 max-lg:data-hidden:opacity-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
