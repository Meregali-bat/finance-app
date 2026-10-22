/**
 * Resgates previstos das caixinhas: dinheiro guardado com data para voltar.
 *
 * Um depósito com `plannedWithdrawalAt` não é guardado — é dinheiro
 * estacionado rendendo até o dia de usar. A Previsão e o orçamento contam com
 * ele de volta naquele dia, e as fatias não o contam como guardado.
 *
 * Dinheiro que já estava na caixinha ganha data por um resgate agendado
 * (`JarWithdrawalPlan`), que vale o mesmo que um depósito com data.
 *
 * O que já voltou sai da conta sozinho: cada resgate de verdade da caixinha
 * abate os previstos, o de data mais próxima primeiro, entre os depósitos
 * feitos até o dia do resgate. Calculado na hora, e não gravado, para que
 * desfazer um resgate devolva o previsto sem nada para consertar. Puro.
 */

export interface JarMovement {
  /** O id do depósito, para poder cancelar a data dele. */
  id?: string;
  jarId: string;
  /** Positivo guardou, negativo resgatou. */
  amount: number;
  /** O instante do movimento. */
  date: Date;
  /** Num depósito: o dia (meia-noite UTC) em que ele deve voltar. */
  plannedWithdrawalAt?: Date | null;
}

/** Um resgate agendado para dinheiro que já estava na caixinha. */
export interface ScheduledWithdrawal {
  id: string;
  jarId: string;
  amount: number;
  /** O dia previsto, meia-noite UTC. */
  date: Date;
  /** Quando foi agendado: só resgates depois disso o abatem. */
  createdAt: Date;
}

export interface JarReturn {
  /** De onde vem: um depósito com data, ou um resgate agendado. */
  source: { kind: "deposit" | "schedule"; id: string };
  jarId: string;
  /** O que ainda falta voltar deste depósito. */
  amount: number;
  /** O dia previsto, meia-noite UTC. */
  date: Date;
  /** O dia passou e o dinheiro não foi resgatado. */
  overdue: boolean;
}

function cents(n: number) {
  return Math.round(n * 100) / 100;
}

/** O dia de `today` como meia-noite UTC, para comparar com os dias previstos. */
function utcToday(today: Date) {
  return Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
}

export function jarReturns(
  movements: JarMovement[],
  today: Date,
  schedules: ScheduledWithdrawal[] = [],
): JarReturn[] {
  const byJar = new Map<string, JarMovement[]>();
  for (const m of movements) byJar.set(m.jarId, [...(byJar.get(m.jarId) ?? []), m]);
  for (const s of schedules) if (!byJar.has(s.jarId)) byJar.set(s.jarId, []);

  const result: JarReturn[] = [];
  for (const [jarId, list] of byJar) {
    const plans = [
      ...list
        .filter((m) => m.amount > 0 && m.plannedWithdrawalAt)
        .map((m) => ({
          source: { kind: "deposit" as const, id: m.id ?? "" },
          deposited: m.date,
          date: m.plannedWithdrawalAt!,
          left: m.amount,
        })),
      ...schedules
        .filter((s) => s.jarId === jarId && s.amount > 0)
        .map((s) => ({
          source: { kind: "schedule" as const, id: s.id },
          deposited: s.createdAt,
          date: s.date,
          left: s.amount,
        })),
    ];
    const withdrawals = list
      .filter((m) => m.amount < 0)
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    for (const w of withdrawals) {
      let out = -w.amount;
      const eligible = plans
        .filter((p) => p.left > 0.005 && p.deposited.getTime() <= w.date.getTime())
        .sort((a, b) => a.date.getTime() - b.date.getTime());
      for (const plan of eligible) {
        if (out <= 0.005) break;
        const take = Math.min(out, plan.left);
        plan.left = cents(plan.left - take);
        out = cents(out - take);
      }
    }

    for (const plan of plans) {
      if (plan.left <= 0.005) continue;
      result.push({
        source: plan.source,
        jarId,
        amount: plan.left,
        date: plan.date,
        overdue: plan.date.getTime() < utcToday(today),
      });
    }
  }
  return result.sort((a, b) => a.date.getTime() - b.date.getTime());
}
