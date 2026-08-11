"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { formatCurrency } from "@/lib/format";

// `useLayoutEffect` avisa no servidor, onde não existe layout para medir.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * O valor principal do dia, contando até o número. Não é enfeite: ver o valor
 * subir dá a escala da quantia antes de o olho ler os dígitos.
 *
 * O spring persegue o alvo a partir de onde estiver, então uma atualização no
 * meio da contagem continua de lá em vez de reiniciar.
 */
export function AnimatedCurrency({ value, className }: { value: number; className?: string }) {
  const reduceMotion = useReducedMotion();
  const target = useMotionValue(value);
  const spring = useSpring(target, { bounce: 0, duration: 0.9 });
  const [display, setDisplay] = useState(value);

  // A contagem de entrada é armada antes do primeiro paint. Se fosse num
  // effect normal, o número apareceria no valor final para só então voltar a
  // zero e subir de novo.
  useIsomorphicLayoutEffect(() => {
    if (reduceMotion) return;
    spring.jump(0);
    setDisplay(0);
    target.set(value);
    // Só na montagem: mudanças de `value` são tratadas pelo effect abaixo.
  }, []);

  useEffect(() => {
    target.set(value);
  }, [target, value]);

  useEffect(() => spring.on("change", setDisplay), [spring]);

  // Movimento reduzido não ganha uma contagem mais lenta — ganha o número.
  return <span className={className}>{formatCurrency(reduceMotion ? value : display)}</span>;
}
