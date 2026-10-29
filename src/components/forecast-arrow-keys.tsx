"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * ← e → trocam de ciclo na Previsão, como as setas da barra; Home volta ao
 * ciclo atual. Fora de um campo
 * de texto e sem modificador: Alt+← é o voltar do navegador.
 */
export function ForecastArrowKeys({
  previousHref,
  nextHref,
  homeHref = null,
}: {
  previousHref: string | null;
  nextHref: string | null;
  homeHref?: string | null;
}) {
  const router = useRouter();
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable], [role=dialog]")) return;
      const href =
        event.key === "ArrowLeft"
          ? previousHref
          : event.key === "ArrowRight"
            ? nextHref
            : event.key === "Home"
              ? homeHref
              : null;
      if (!href) return;
      event.preventDefault();
      router.push(href, { scroll: false });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, previousHref, nextHref, homeHref]);
  return null;
}
