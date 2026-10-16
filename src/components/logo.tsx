"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * "O anel do ciclo": o anel é o período entre um pagamento e o próximo, a
 * abertura é o que ainda falta e o ponto é hoje — a pergunta que o app
 * responde.
 *
 * Entra desenhando o anel (o traço vai do fim ao começo) e só então o ponto
 * aparece com um leve overshoot. Com movimento reduzido, já nasce pronto.
 */
const TONES = {
  /** Sobre o fundo escuro do app. */
  dark: { ring: "#f2a99f", dot: "#ffffff" },
  /** Dentro do ícone de app, sobre o garnet. */
  icon: { ring: "#ffd2cb", dot: "#ffffff" },
  /** Sobre fundo claro. */
  light: { ring: "#6b0504", dot: "#ea5d4f" },
} as const;

export function LogoMark({
  size = 30,
  tone = "dark",
  animated = true,
  className,
}: {
  size?: number;
  tone?: keyof typeof TONES;
  animated?: boolean;
  className?: string;
}) {
  // `initial` não pode depender da preferência: no servidor ela não existe, e
  // o HTML sairia diferente do primeiro render do browser. Com movimento
  // reduzido o estado inicial é o mesmo, só a transição dura zero.
  const reduce = useReducedMotion();
  const instant = reduce ? { duration: 0 } : null;
  const { ring, dot } = TONES[tone];
  // Em tamanhos pequenos o traço e o ponto engrossam para não sumir.
  const small = size <= 32 && tone === "icon";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn("shrink-0 overflow-visible", className)}
    >
      <motion.circle
        cx="16"
        cy="16"
        r="11"
        fill="none"
        stroke={ring}
        strokeWidth={small ? 5 : 4.5}
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray="70 100"
        transform="rotate(-90 16 16)"
        initial={animated ? { strokeDashoffset: 70 } : false}
        animate={{ strokeDashoffset: 0 }}
        transition={instant ?? { duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
      />
      <motion.circle
        cx="7.1"
        cy="9.53"
        r={small ? 3 : 2.6}
        fill={dot}
        style={{ transformOrigin: "7.1px 9.53px" }}
        initial={animated ? { scale: 0 } : false}
        animate={{ scale: 1 }}
        transition={instant ?? { duration: 0.5, ease: [0.34, 1.56, 0.64, 1], delay: 1 }}
      />
    </svg>
  );
}

/** A marca com o nome, em minúsculas, como no handoff. */
export function Logo({
  size = "md",
  className,
}: {
  /** lg: login (36px + 26px). md: barra lateral (30px + 22px). sm: topo do celular (24px + 19px). */
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const mark = size === "lg" ? 36 : size === "md" ? 30 : 24;
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark size={mark} />
      <span
        className={cn(
          "font-heading leading-none font-bold tracking-[-0.035em]",
          size === "lg" ? "text-[26px]" : size === "md" ? "text-[22px]" : "text-[19px]",
        )}
      >
        finanças
      </span>
    </span>
  );
}
