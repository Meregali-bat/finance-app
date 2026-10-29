import { describe, expect, it } from "vitest";
import { pauseTimer, resumeTimer, startTimer, timeLeft } from "./pausable-timer";

describe("pausable timer", () => {
  it("counts down while running", () => {
    const t = startTimer(8000, 1000);
    expect(timeLeft(t, 1000)).toBe(8000);
    expect(timeLeft(t, 4000)).toBe(5000);
    expect(timeLeft(t, 20000)).toBe(0);
  });

  it("stops counting while paused and resumes with what was left", () => {
    let t = startTimer(8000, 0);
    t = pauseTimer(t, 3000);
    expect(t).toEqual({ remaining: 5000, startedAt: null });
    // Parado, o tempo não passa.
    expect(timeLeft(t, 60000)).toBe(5000);
    t = resumeTimer(t, 60000);
    expect(t).toEqual({ remaining: 5000, startedAt: 60000 });
    expect(timeLeft(t, 62000)).toBe(3000);
  });

  it("does not reset on resume (pause, resume, pause accumulates)", () => {
    let t = startTimer(8000, 0);
    t = pauseTimer(t, 2000);
    t = resumeTimer(t, 5000);
    t = pauseTimer(t, 8000);
    expect(t.remaining).toBe(3000);
  });

  it("gives a minimum breath after a pause", () => {
    let t = startTimer(8000, 0);
    t = pauseTimer(t, 7900);
    t = resumeTimer(t, 9000, 1500);
    expect(t.remaining).toBe(1500);
    // Com mais que o mínimo, fica o que faltava.
    t = resumeTimer(pauseTimer(startTimer(8000, 0), 1000), 1000, 1500);
    expect(t.remaining).toBe(7000);
  });

  it("is idempotent for repeated pause or resume", () => {
    const paused = pauseTimer(startTimer(8000, 0), 1000);
    expect(pauseTimer(paused, 5000)).toBe(paused);
    const running = startTimer(8000, 0);
    expect(resumeTimer(running, 5000)).toBe(running);
  });

  it("clamps a negative clock skew and duration", () => {
    expect(timeLeft(startTimer(8000, 1000), 500)).toBe(8000);
    expect(startTimer(-5, 0).remaining).toBe(0);
  });
});
