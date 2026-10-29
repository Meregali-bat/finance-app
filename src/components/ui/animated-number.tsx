"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { animate, useReducedMotion } from "motion/react";
import { formatCurrency } from "@/lib/format";

// `useLayoutEffect` avisa no servidor, onde não existe layout para medir.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const currencyParts = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Uma mudança de valor anda até o novo em vez de trocar de repente. */
const CHANGE_DURATION = 0.45;
const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];
const STORAGE_PREFIX = "leeway:last-seen:";

function readLastSeen(key: string): number | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_PREFIX + key);
    if (raw == null) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeLastSeen(key: string, value: number) {
  try {
    window.sessionStorage.setItem(STORAGE_PREFIX + key, String(value));
  } catch {
    // Sem armazenamento (aba privada, bloqueado): só não há o que lembrar.
  }
}

const subscribeNothing = () => () => {};

/**
 * Um valor em reais que já nasce no número certo. Quem abre o app várias vezes
 * por dia para ler o número não pode esperar uma contagem a partir de zero —
 * nem ver, por um segundo, um valor que não é o seu.
 *
 * Só há movimento quando o valor muda, curto e sem atraso, do anterior até o
 * novo:
 * - numa atualização na própria tela (lançou um gasto, trocou de ciclo);
 * - com `memoryKey`, também ao voltar para a tela: o último valor visto fica
 *   no `sessionStorage`, e se ele mudou desde então o número anda de lá até o
 *   novo. Isso só acontece numa navegação dentro do app — no primeiro
 *   carregamento o HTML do servidor já mostrou o valor novo, e voltar ao
 *   antigo para contar de novo seria mostrar um número errado.
 *
 * `reveal` é a exceção: conta de 0 até o valor, com `duration` e `delay`. É
 * para o momento único do fim do primeiro uso, não para telas de todo dia.
 *
 * `split` separa "R$", o inteiro e os centavos, para o número grande do hero:
 * o inteiro é o que importa, o resto fica menor e mais apagado.
 */
export function CountUpCurrency({
  value,
  memoryKey,
  reveal = false,
  duration = 1.3,
  delay = 0,
  split = false,
  className,
  symbolClassName,
  centsClassName,
}: {
  value: number;
  /** Lembra o último valor visto com essa chave e anima a diferença ao voltar. */
  memoryKey?: string;
  /** Conta de 0 na montagem (só para revelações únicas). */
  reveal?: boolean;
  /** Só com `reveal`, em segundos. */
  duration?: number;
  /** Só com `reveal`, em segundos. */
  delay?: number;
  split?: boolean;
  className?: string;
  symbolClassName?: string;
  centsClassName?: string;
}) {
  const reduceMotion = useReducedMotion();
  // `false` só na renderização da hidratação, quando o servidor já pintou o
  // valor final; `true` numa montagem feita no cliente (navegação).
  const clientMount = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  const mountedOnClient = useRef(clientMount);
  const [display, setDisplay] = useState(value);
  // O valor que está na tela, de onde a próxima animação parte.
  const from = useRef(value);
  // Na montagem, o ponto de partida e o atraso da primeira animação.
  const entry = useRef<{ start: number; delay: number } | null>(null);

  // Armado antes do primeiro paint: num effect normal, o número apareceria no
  // valor final para só então voltar ao ponto de partida.
  useIsomorphicLayoutEffect(() => {
    if (reduceMotion) return;
    let start: number | null = null;
    if (reveal) start = 0;
    else if (memoryKey && mountedOnClient.current) start = readLastSeen(memoryKey);
    if (start == null || Math.abs(start - value) < 0.005) return;
    entry.current = { start, delay: reveal ? delay : 0 };
    from.current = start;
    setDisplay(start);
    // Só na montagem: mudanças de `value` são tratadas pelo effect abaixo.
  }, []);

  useEffect(() => {
    if (memoryKey) writeLastSeen(memoryKey, value);
  }, [memoryKey, value]);

  useEffect(() => {
    if (reduceMotion) return;
    if (Math.abs(from.current - value) < 0.005) return;
    const first = entry.current;
    const controls = animate(from.current, value, {
      duration: first && reveal ? duration : CHANGE_DURATION,
      delay: first ? first.delay : 0,
      ease: EASE_OUT,
      onUpdate: (latest) => {
        // Limpo aqui, e não logo após `animate`: no modo estrito o efeito roda
        // duas vezes, e a segunda perderia o atraso da revelação.
        entry.current = null;
        from.current = latest;
        setDisplay(latest);
      },
    });
    return () => controls.stop();
  }, [value, reduceMotion, reveal, duration]);

  const shownValue = reduceMotion ? value : display;
  // O leitor de tela lê só o valor final, como texto: `aria-label` num span
  // genérico é proibido e muitas vezes não é lido, e os dígitos que contam
  // anunciariam valores intermediários.
  const finalText = <span className="sr-only">{formatCurrency(value)}</span>;
  if (!split) {
    return (
      <span className={className}>
        {finalText}
        <span aria-hidden="true">{formatCurrency(shownValue)}</span>
      </span>
    );
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
    <span className={className}>
      {finalText}
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
