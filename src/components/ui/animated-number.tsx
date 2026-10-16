"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { animate, useMotionValue, useReducedMotion, useSpring } from "motion/react";
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

const currencyParts = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Conta de 0 até o valor com uma duração e um atraso fixos — para as entradas
 * coreografadas do Início, onde cada número começa num momento diferente. Uma
 * mudança depois disso conta a partir de onde está.
 *
 * `split` separa "R$", o inteiro e os centavos, para o número grande do hero:
 * o inteiro é o que importa, o resto fica menor e mais apagado.
 */
export function CountUpCurrency({
  value,
  duration = 1.3,
  delay = 0,
  split = false,
  className,
  symbolClassName,
  centsClassName,
}: {
  value: number;
  duration?: number;
  delay?: number;
  split?: boolean;
  className?: string;
  symbolClassName?: string;
  centsClassName?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(value);
  // De onde a próxima contagem parte, e se a de entrada (com atraso) já foi.
  const from = useRef(0);
  const entered = useRef(false);

  useIsomorphicLayoutEffect(() => {
    if (reduceMotion) return;
    setDisplay(0);
    // Só na montagem: a próxima mudança de `value` conta de onde estiver.
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const controls = animate(from.current, value, {
      duration,
      delay: entered.current ? 0 : delay,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        // Marcado aqui, e não logo após `animate`: no modo estrito o efeito
        // roda duas vezes, e a segunda perderia o atraso de entrada.
        entered.current = true;
        from.current = latest;
        setDisplay(latest);
      },
    });
    return () => controls.stop();
  }, [value, reduceMotion, duration, delay]);

  const shownValue = reduceMotion ? value : display;
  if (!split) {
    return <span className={className}>{formatCurrency(shownValue)}</span>;
  }

  const parts = currencyParts.formatToParts(shownValue);
  const sign = parts.filter((p) => p.type === "minusSign").map((p) => p.value).join("");
  const symbol = parts.find((p) => p.type === "currency")?.value ?? "R$";
  const integer = parts
    .filter((p) => p.type === "integer" || p.type === "group")
    .map((p) => p.value)
    .join("");
  const cents = parts
    .filter((p) => p.type === "decimal" || p.type === "fraction")
    .map((p) => p.value)
    .join("");

  return (
    <span className={className} aria-label={formatCurrency(value)}>
      <span aria-hidden="true" className={symbolClassName}>
        {sign}
        {symbol}
      </span>
      <span aria-hidden="true">{integer}</span>
      <span aria-hidden="true" className={centsClassName}>
        {cents}
      </span>
    </span>
  );
}
