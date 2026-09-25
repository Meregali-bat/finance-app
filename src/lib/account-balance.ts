/**
 * Cálculo puro do saldo em conta — o dinheiro que está no banco AGORA.
 *
 * Não confundir com `periodBalance` (src/lib/period.ts), que desconta tudo que
 * está comprometido no período mesmo sem ter vencido. Aqui só entra dinheiro
 * que já se moveu de fato: um boleto que vence semana que vem não pesa.
 *
 * O app não conhece a conta bancária, então o saldo não é derivável sozinho —
 * falta o ponto de partida. Ele parte do ajuste (a leitura do extrato que o
 * usuário informou) e soma dali para frente.
 */

export interface AccountBalanceAdjustmentInput {
  balance: number;
  /** O marco: só entra na soma o que foi registrado depois deste instante. */
  createdAt: Date;
}

export interface AccountMovementInput {
  amount: number;
  /**
   * Quando a linha foi gravada. Nulo nos lançamentos anteriores à coluna
   * `createdAt` (migration 20260817124936) — e essas são, por construção, mais
   * velhas que qualquer ajuste.
   */
  registeredAt?: Date | null;
  /**
   * Quando o dinheiro se move de fato. Aceita tanto um dia de calendário já
   * normalizado por `storedDay()` quanto um instante real como `paidAt`: a
   * comparação com hoje é feita por dia, nunca por instante.
   */
  occurredOn: Date;
}

export interface AccountBalanceInput {
  adjustment?: AccountBalanceAdjustmentInput;
  /** Entram somando: recebimentos confirmados. */
  credits: AccountMovementInput[];
  /**
   * Entram subtraindo. Entrada avulsa chega com `amount` negativo e soma.
   * Créditos e débitos datados antes do ajuste ficam de fora mesmo registrados
   * depois — ver `alreadyInReading`.
   */
  debits: AccountMovementInput[];
  today: Date;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * As duas comparações têm granularidades diferentes de propósito.
 *
 * O marco é por **instante**: dois lançamentos do mesmo dia podem cair em
 * lados opostos do ajuste, e arredondar para o dia colocaria os dois do mesmo
 * lado.
 *
 * "Até hoje" é por **dia**: um pagamento confirmado às 22h ainda é dinheiro que
 * já saiu, e comparar o instante cru o jogaria para fora.
 */
function countsTowardBalance(
  movement: AccountMovementInput,
  adjustedAt: Date,
  todayStart: number,
): boolean {
  if (!movement.registeredAt) return false;
  if (movement.registeredAt.getTime() <= adjustedAt.getTime()) return false;
  return startOfDay(movement.occurredOn).getTime() <= todayStart;
}

function sumCounted(
  movements: AccountMovementInput[],
  adjustedAt: Date,
  todayStart: number,
): number {
  return movements
    .filter((m) => countsTowardBalance(m, adjustedAt, todayStart))
    .reduce((sum, m) => sum + m.amount, 0);
}

/**
 * O movimento já estava no extrato quando o saldo foi informado?
 *
 * Registrado antes do ajuste, sempre: é a regra de `countsTowardBalance`. Mas
 * registrar depois não prova que aconteceu depois. O salário que caiu dia 5 e
 * só foi confirmado dia 7, a compra do dia 3 lançada dia 8, a fatura paga dia
 * 2 e marcada dia 6: se o saldo foi corrigido no meio, o banco já os mostrava,
 * e somá-los de novo contaria o mesmo dinheiro duas vezes. Então vale a data
 * do movimento: de um dia anterior ao do ajuste, ele já estava lá.
 *
 * O próprio dia do ajuste não dá para separar — os movimentos têm dia, não
 * hora. Ali a dúvida se resolve para o lado seguro, porque o saldo decide
 * quanto se pode gastar: o que tira dinheiro conta (o gasto das 15h depois do
 * ajuste das 9h), e o que põe dinheiro fica de fora (o salário que já estava
 * na tela quando o saldo foi corrigido). Se era o contrário, o saldo fica
 * menor do que é até a próxima correção — nunca maior.
 */
function alreadyInReading(
  movement: AccountMovementInput,
  adjustedAt: Date,
  raisesBalance: boolean,
): boolean {
  const day = startOfDay(movement.occurredOn).getTime();
  const readingDay = startOfDay(adjustedAt).getTime();
  return raisesBalance ? day <= readingDay : day < readingDay;
}

/** Nulo quando nunca houve ajuste: não há saldo a inventar. */
export function calculateAccountBalance(input: AccountBalanceInput): number | null {
  const { adjustment, credits, debits, today } = input;
  if (!adjustment) return null;

  const adjustedAt = adjustment.createdAt;
  const todayStart = startOfDay(today).getTime();
  // Um crédito sobe o saldo; um débito também, quando é a entrada avulsa que
  // chega com valor negativo.
  const notYetRead = (raises: (m: AccountMovementInput) => boolean) => (m: AccountMovementInput) =>
    !alreadyInReading(m, adjustedAt, raises(m));

  return (
    adjustment.balance +
    sumCounted(
      credits.filter(notYetRead((m) => m.amount > 0)),
      adjustedAt,
      todayStart,
    ) -
    sumCounted(
      debits.filter(notYetRead((m) => m.amount < 0)),
      adjustedAt,
      todayStart,
    )
  );
}

/**
 * Tudo que o app viu se mover até hoje, sem marco de ajuste nenhum.
 *
 * Serve de referência na primeira vez que o usuário vai informar o saldo: não é
 * o que existe no banco — o app não conhece o que havia antes dele nem o que se
 * move fora dele —, mas dá a ordem de grandeza para quem não faz ideia de que
 * número digitar. Quem exibe precisa rotular como movimentação registrada, não
 * como saldo.
 *
 * Diferente de `calculateAccountBalance`, aceita movimento sem `registeredAt`:
 * sem marco, não há o que uma linha antiga possa duplicar.
 */
export function calculateRegisteredMovement(input: {
  credits: AccountMovementInput[];
  debits: AccountMovementInput[];
  today: Date;
}): number {
  const todayStart = startOfDay(input.today).getTime();
  const upToToday = (m: AccountMovementInput) =>
    startOfDay(m.occurredOn).getTime() <= todayStart;

  const credited = input.credits.filter(upToToday).reduce((sum, m) => sum + m.amount, 0);
  const debited = input.debits.filter(upToToday).reduce((sum, m) => sum + m.amount, 0);
  return credited - debited;
}
