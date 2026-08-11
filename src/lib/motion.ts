import type { Transition } from "motion/react";

/**
 * Springs em vez de durações fixas: um spring é interrompível por natureza —
 * mudar o alvo no meio do caminho continua de onde está, sem pulo.
 *
 * `bounce` e `duration` são o par que a Apple expõe no lugar de
 * massa/rigidez/amortecimento: `bounce: 0` é criticamente amortecido (chega e
 * para), e `duration` é quão rápido chega, não um tempo fixo de animação.
 */

/** Padrão para UI: sem overshoot. Um menu que só apareceu não deve quicar. */
export const springDefault: Transition = { type: "spring", bounce: 0, duration: 0.35 };

/** Só para o que veio de um gesto com momento — um arrasto, um flick. */
export const springBouncy: Transition = { type: "spring", bounce: 0.2, duration: 0.4 };
