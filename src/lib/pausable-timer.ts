/**
 * Um prazo que pode parar e continuar de onde parou — o do "Desfazer". Puro:
 * quem chama passa o relógio (`now`, em ms) e agenda o `setTimeout` com o
 * `remaining` quando o prazo está correndo.
 */
export type PausableTimer = {
  /** O que falta, medido no último `start`, `pause` ou `resume`. */
  remaining: number;
  /** Quando voltou a correr; `null` enquanto está parado. */
  startedAt: number | null;
};

export function startTimer(duration: number, now: number): PausableTimer {
  return { remaining: Math.max(0, duration), startedAt: now };
}

/** O que falta neste instante, correndo ou parado. */
export function timeLeft(timer: PausableTimer, now: number): number {
  if (timer.startedAt === null) return timer.remaining;
  return Math.max(0, timer.remaining - Math.max(0, now - timer.startedAt));
}

export function pauseTimer(timer: PausableTimer, now: number): PausableTimer {
  if (timer.startedAt === null) return timer;
  return { remaining: timeLeft(timer, now), startedAt: null };
}

/**
 * Volta a correr com o que faltava. `minRemaining` dá um fôlego depois da
 * pausa: tirar o mouse com 200ms restantes não pode sumir com o aviso na
 * cara da pessoa.
 */
export function resumeTimer(
  timer: PausableTimer,
  now: number,
  minRemaining = 0,
): PausableTimer {
  if (timer.startedAt !== null) return timer;
  return { remaining: Math.max(timer.remaining, minRemaining), startedAt: now };
}
