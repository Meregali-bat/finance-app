# Confirmar pagamento nos lembretes de despesa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar aos lembretes de despesa do dashboard (fatura de cartão e despesa fixa) um botão "Marcar como paga" que registra o valor realmente pago, some o lembrete da lista e deixa o pagamento visível no Histórico.

**Architecture:** Espelha o modelo que já existe para receitas (`IncomeReceipt` + `MarkIncomeReceivedDialog` + `markIncomeReceived`). Um novo modelo `ExpensePayment` guarda a confirmação de uma ocorrência específica (identificada por despesa/cartão + data de vencimento). A camada pura `src/lib/period.ts` passa a receber esses pagamentos: uma ocorrência paga **sai da lista de lembretes mas continua somando no total do período** — confirmar não libera dinheiro, só para de cobrar. Quando o valor pago difere da estimativa, o valor pago substitui a estimativa no cálculo. O Histórico ganha as linhas de pagamento, com regra de soma diferente para cada tipo (ver Global Constraints).

**Tech Stack:** Next.js 16 (App Router, Server Components + Server Actions), React 19, Prisma 7 (PostgreSQL, client gerado em `src/generated/prisma`), Zod 4, Tailwind 4 + Base UI, Vitest 4.

## Global Constraints

- **Idioma da UI: português do Brasil.** Todo texto visível ao usuário em pt-BR, sem exceção (rótulos, títulos de diálogo, mensagens de erro, `aria-label`).
- **Formato de mensagem de commit:** `:emoji: type: description` — o código do gitmoji vem **antes** da tag Conventional Commits. Ex.: `:sparkles: feat: add expense payment confirmation`.
- **`src/lib/period.ts` é puro.** Nenhum import de Prisma, `next/*` ou qualquer coisa com I/O. Só funções sobre dados simples.
- **Datas de ocorrência são dias, não instantes.** Sempre normalizar com `startOfDay` antes de comparar ou gravar. Ao mandar uma data do servidor para o cliente e de volta, transitar como ISO string (`toISOString()`) — nunca como data formatada, que renderiza no fuso do browser e pode cair um dia fora.
- **Confirmar pagamento NÃO altera o saldo do período.** O valor já estava reservado desde que o lembrete apareceu. Confirmar só (a) remove o lembrete e (b) troca a estimativa pelo valor real, se forem diferentes.
- **Total de gastos do mês no Histórico:** despesa fixa paga **entra** no total e nas categorias (hoje ela não aparece em lugar nenhum). Fatura de cartão paga **não entra** — as compras do cartão já aparecem uma a uma, e somar a fatura contaria o mesmo dinheiro duas vezes.
- **Prisma client é gerado**, não commitado à mão: rodar `npx prisma generate` depois de mexer no schema. `npm run build` já roda isso.
- **Rodar os testes com `npm test`** (`vitest run`). Rodar o lint com `npm run lint`.

---

### Task 1: Modelo `ExpensePayment` e migration

Um pagamento confirmado aponta para **ou** uma despesa fixa **ou** um cartão — nunca os dois. Duas FKs anuláveis (em vez de um `refId` polimórfico) dão `onDelete: Cascade` de verdade: apagar a despesa fixa ou o cartão leva junto os pagamentos órfãos. No Postgres, `NULL`s são distintos entre si em índice único, então as duas uniques compostas convivem sem conflito.

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_expense_payment/migration.sql` (gerado pelo Prisma, não escrito à mão)

**Interfaces:**
- Consumes: nada (primeira task).
- Produces: modelo Prisma `ExpensePayment` com os campos `id`, `userId`, `fixedExpenseId?`, `cardId?`, `dueDate`, `amount`, `paidAt`, `createdAt`; uniques `fixedExpenseId_dueDate` e `cardId_dueDate`; relações `user`, `fixedExpense`, `card`. As tasks 3, 4 e 5 usam `prisma.expensePayment`.

- [ ] **Step 1: Adicionar o modelo ao schema**

Em `prisma/schema.prisma`, adicionar o modelo abaixo logo depois de `model FixedExpense`:

```prisma
/// Confirmação de que uma ocorrência específica de despesa (fatura de cartão
/// ou despesa fixa) foi paga. Uma ocorrência paga sai dos lembretes mas
/// continua somando no total do período — ver calculateDailyBudget em
/// src/lib/period.ts.
model ExpensePayment {
  id             String        @id @default(cuid())
  userId         String
  /// Preenchido quando o pagamento quita uma despesa fixa avulsa.
  fixedExpenseId String?
  /// Preenchido quando o pagamento quita a fatura de um cartão.
  cardId         String?
  /// O vencimento da ocorrência quitada — a identidade do pagamento, mesmo
  /// quando ele acontece antes do vencimento.
  dueDate        DateTime
  amount         Decimal
  /// Quando o pagamento foi confirmado. É por esta data que o Histórico
  /// agrupa o pagamento em um mês.
  paidAt         DateTime      @default(now())
  createdAt      DateTime      @default(now())
  user           User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  fixedExpense   FixedExpense? @relation(fields: [fixedExpenseId], references: [id], onDelete: Cascade)
  card           CreditCard?   @relation(fields: [cardId], references: [id], onDelete: Cascade)

  @@unique([fixedExpenseId, dueDate])
  @@unique([cardId, dueDate])
  @@index([userId, paidAt])
}
```

- [ ] **Step 2: Declarar as relações inversas**

Prisma exige o outro lado de cada relação. Três edições:

Em `model User`, depois da linha `periodAllocations PeriodAllocation[]`:

```prisma
  expensePayments   ExpensePayment[]
```

Em `model FixedExpense`, depois da linha `card      CreditCard? @relation(...)`:

```prisma
  payments  ExpensePayment[]
```

Em `model CreditCard`, depois da linha `fixedExpenses FixedExpense[]`:

```prisma
  payments      ExpensePayment[]
```

- [ ] **Step 3: Gerar a migration e o client**

```bash
npx prisma migrate dev --name add_expense_payment
```

Esperado: cria `prisma/migrations/<timestamp>_add_expense_payment/migration.sql` com o `CREATE TABLE "ExpensePayment"` e regenera o client em `src/generated/prisma`. Se falhar por falta de `DATABASE_URL`, conferir que `.env` existe na raiz — `prisma.config.ts` carrega via `dotenv/config`.

- [ ] **Step 4: Verificar que o client compila**

```bash
npx tsc --noEmit
```

Esperado: sem erros. `prisma.expensePayment` já existe no client gerado.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/generated/prisma
git commit -m ":sparkles: feat: add the ExpensePayment model"
```

---

### Task 2: Ocorrência paga sai do lembrete e mantém o total

O coração da feature, e a única parte com risco real de errar o dinheiro. Toda a lógica é pura, então vai coberta de teste antes de existir.

Hoje `fixedExpenseTotal` é derivado de `fixedExpenseReminders` (`reminders.reduce(...)`), e `cardBillTotal` de `cardBillReminders`. Se a gente simplesmente filtrasse os pagos para fora dos lembretes, os totais cairiam junto e o orçamento diário daria um salto na hora que o usuário confirmasse o pagamento — exatamente o bug que essa task previne. A solução é separar as duas coisas: uma lista de **ocorrências** (base dos totais) e uma lista de **lembretes** (as ocorrências ainda não pagas).

**Files:**
- Modify: `src/lib/period.ts`
- Test: `src/lib/period.test.ts`

**Interfaces:**
- Consumes: nada da Task 1 (módulo puro, não conhece Prisma).
- Produces:
  - `export interface ExpensePaymentInput { fixedExpenseId?: string; cardId?: string; dueDate: Date; amount: number }`
  - `calculateDailyBudget` passa a aceitar o campo opcional `expensePayments?: ExpensePaymentInput[]` no seu objeto de input. Todos os campos e o tipo de retorno `PeriodBudget` continuam iguais — só muda o *conteúdo* de `fixedExpenseReminders`, `cardBillReminders`, `fixedExpenseTotal` e `cardBillTotal`.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao fim de `src/lib/period.test.ts`:

```ts
describe("calculateDailyBudget com pagamentos confirmados", () => {
  const baseInput = {
    incomes: [{ id: "i1", amount: 3000, dayOfMonth: 5 }],
    incomeReceipts: [{ incomeId: "i1", occurrenceDate: new Date(2026, 0, 5), amount: 3000 }],
    creditCards: [],
    cardPurchases: [],
    transactions: [],
    today: new Date(2026, 0, 10),
  };

  it("tira a despesa fixa paga dos lembretes", () => {
    const budget = calculateDailyBudget({
      ...baseInput,
      fixedExpenses: [{ id: "e1", amount: 500, dueDay: 20 }],
      expensePayments: [{ fixedExpenseId: "e1", dueDate: new Date(2026, 0, 20), amount: 500 }],
    });
    expect(budget.fixedExpenseReminders).toEqual([]);
  });

  it("mantém a despesa fixa paga no total do período", () => {
    // Confirmar o pagamento não devolve dinheiro: o valor já estava reservado.
    const unpaid = calculateDailyBudget({
      ...baseInput,
      fixedExpenses: [{ id: "e1", amount: 500, dueDay: 20 }],
    });
    const paid = calculateDailyBudget({
      ...baseInput,
      fixedExpenses: [{ id: "e1", amount: 500, dueDay: 20 }],
      expensePayments: [{ fixedExpenseId: "e1", dueDate: new Date(2026, 0, 20), amount: 500 }],
    });
    expect(paid.fixedExpenseTotal).toBe(500);
    expect(paid.periodBalance).toBe(unpaid.periodBalance);
  });

  it("usa o valor pago no lugar da estimativa quando eles diferem", () => {
    const budget = calculateDailyBudget({
      ...baseInput,
      fixedExpenses: [{ id: "e1", amount: 500, dueDay: 20 }],
      expensePayments: [{ fixedExpenseId: "e1", dueDate: new Date(2026, 0, 20), amount: 620 }],
    });
    expect(budget.fixedExpenseTotal).toBe(620);
    expect(budget.periodBalance).toBe(3000 - 620);
  });

  it("não confunde o pagamento de uma ocorrência com o de outro mês", () => {
    const budget = calculateDailyBudget({
      ...baseInput,
      fixedExpenses: [{ id: "e1", amount: 500, dueDay: 20 }],
      // Pagamento do vencimento de dezembro, não o de janeiro.
      expensePayments: [{ fixedExpenseId: "e1", dueDate: new Date(2025, 11, 20), amount: 500 }],
    });
    expect(budget.fixedExpenseReminders).toHaveLength(1);
    expect(budget.fixedExpenseReminders[0].dueDate).toEqual(new Date(2026, 0, 20));
  });

  it("ignora a hora do dia ao casar o pagamento com a ocorrência", () => {
    const budget = calculateDailyBudget({
      ...baseInput,
      fixedExpenses: [{ id: "e1", amount: 500, dueDay: 20 }],
      expensePayments: [
        { fixedExpenseId: "e1", dueDate: new Date(2026, 0, 20, 15, 30), amount: 500 },
      ],
    });
    expect(budget.fixedExpenseReminders).toEqual([]);
  });

  it("tira a fatura paga dos lembretes sem mexer no total", () => {
    const input = {
      ...baseInput,
      fixedExpenses: [],
      creditCards: [{ id: "c1", closingDay: 28, dueDay: 8 }],
      cardPurchases: [{ cardId: "c1", amount: 200, date: new Date(2025, 11, 30) }],
      today: new Date(2026, 0, 6),
      incomeReceipts: [{ incomeId: "i1", occurrenceDate: new Date(2025, 11, 5), amount: 3000 }],
    };
    const unpaid = calculateDailyBudget(input);
    expect(unpaid.cardBillReminders).toHaveLength(1);

    const paid = calculateDailyBudget({
      ...input,
      expensePayments: [{ cardId: "c1", dueDate: unpaid.cardBillReminders[0].dueDate, amount: 200 }],
    });
    expect(paid.cardBillReminders).toEqual([]);
    expect(paid.cardBillTotal).toBe(unpaid.cardBillTotal);
  });

  it("não deixa o pagamento de uma despesa fixa quitar a fatura de um cartão de mesmo id", () => {
    // fixedExpenseId e cardId vivem em espaços de id diferentes; casar só por
    // data quitaria a coisa errada.
    const budget = calculateDailyBudget({
      ...baseInput,
      fixedExpenses: [{ id: "x", amount: 500, dueDay: 20 }],
      expensePayments: [{ cardId: "x", dueDate: new Date(2026, 0, 20), amount: 500 }],
    });
    expect(budget.fixedExpenseReminders).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Rodar os testes e ver falhar**

Run: `npm test`
Esperado: FAIL. Erro de tipo em `expensePayments` (propriedade desconhecida) e as asserções de lembrete vazio falhando.

- [ ] **Step 3: Adicionar o tipo de input e o helper de busca**

Em `src/lib/period.ts`, depois da interface `CardPurchaseInput` (~linha 46):

```ts
/**
 * Confirmação de que uma ocorrência de despesa foi paga. Exatamente um entre
 * fixedExpenseId e cardId vem preenchido.
 */
export interface ExpensePaymentInput {
  fixedExpenseId?: string;
  cardId?: string;
  /** O vencimento da ocorrência quitada — não a data em que o usuário pagou. */
  dueDate: Date;
  /** O valor realmente pago, que pode diferir da estimativa. */
  amount: number;
}
```

E, junto dos outros helpers privados (depois de `isPaydayConfirmed`, ~linha 184):

```ts
/**
 * O pagamento que quita uma ocorrência, se houver. A chave é o par
 * (de quem é a despesa, qual vencimento) — comparar só por data quitaria a
 * ocorrência errada quando duas despesas vencem no mesmo dia.
 */
function findExpensePayment(
  payments: ExpensePaymentInput[],
  key: { fixedExpenseId?: string; cardId?: string },
  dueDate: Date,
): ExpensePaymentInput | undefined {
  const day = startOfDay(dueDate).getTime();
  return payments.find(
    (p) =>
      p.fixedExpenseId === key.fixedExpenseId &&
      p.cardId === key.cardId &&
      startOfDay(p.dueDate).getTime() === day,
  );
}
```

- [ ] **Step 4: Aceitar `expensePayments` em `calculateDailyBudget`**

Na assinatura de `calculateDailyBudget` (~linha 281), adicionar o campo ao objeto de input, logo depois de `cardPurchases: CardPurchaseInput[];`:

```ts
  expensePayments?: ExpensePaymentInput[];
```

E no destructuring logo abaixo (~linha 289), trocar a linha inteira por:

```ts
  const {
    incomes,
    incomeReceipts = [],
    fixedExpenses,
    creditCards,
    cardPurchases,
    expensePayments = [],
    transactions,
    today,
  } = input;
```

- [ ] **Step 5: Separar ocorrências de lembretes nas despesas fixas**

Substituir o bloco de `fixedExpenseReminders` / `fixedExpenseTotal` (~linhas 334-341) por:

```ts
  /**
   * Toda ocorrência de despesa fixa no período, paga ou não. Os totais saem
   * daqui, não dos lembretes: confirmar um pagamento tira o lembrete da tela
   * mas o dinheiro continua comprometido — se o total caísse junto, o
   * orçamento diário daria um salto na hora do "marcar como paga".
   */
  const fixedExpenseOccurrences = standaloneFixedExpenses.flatMap((exp) => {
    if (exp.dueDay == null) return [];
    return occurrencesInRange(exp.dueDay, periodStart, periodEnd)
      .filter((occ) => isOccurrenceValid(occ, exp.createdAt))
      .map((dueDate) => ({
        expenseId: exp.id,
        dueDate,
        estimate: exp.amount,
        payment: findExpensePayment(expensePayments, { fixedExpenseId: exp.id }, dueDate),
      }));
  });

  const fixedExpenseReminders: FixedExpenseReminder[] = fixedExpenseOccurrences
    .filter((occ) => !occ.payment)
    .map((occ) => ({ expenseId: occ.expenseId, dueDate: occ.dueDate, amount: occ.estimate }));

  const fixedExpenseTotal = fixedExpenseOccurrences.reduce(
    (sum, occ) => sum + (occ.payment ? occ.payment.amount : occ.estimate),
    0,
  );
```

- [ ] **Step 6: Fazer o mesmo com as faturas de cartão**

Substituir o bloco de `cardBillReminders` / `cardBillTotal` (~linhas 343-350) por:

```ts
  const cardBills = getCardBillsInPeriod(
    creditCards,
    cardPurchases,
    periodStart,
    periodEnd,
    cardFixedExpenses,
  );
  const cardBillPayments = cardBills.map((bill) =>
    findExpensePayment(expensePayments, { cardId: bill.cardId }, bill.dueDate),
  );

  const cardBillReminders = cardBills.filter((_, i) => !cardBillPayments[i]);
  const cardBillTotal = cardBills.reduce(
    (sum, bill, i) => sum + (cardBillPayments[i]?.amount ?? bill.amount),
    0,
  );
```

- [ ] **Step 7: Rodar os testes e ver passar**

Run: `npm test`
Esperado: PASS, todos os testes — os novos e os que já existiam (nenhum comportamento antigo muda quando `expensePayments` vem vazio).

- [ ] **Step 8: Commit**

```bash
git add src/lib/period.ts src/lib/period.test.ts
git commit -m ":sparkles: feat: drop paid occurrences from the reminders without refunding the period"
```

---

### Task 3: Server actions de confirmar e desfazer pagamento

**Files:**
- Create: `src/lib/actions/expense-payment.ts`

**Interfaces:**
- Consumes: `prisma.expensePayment` (Task 1); `requireUserId` de `src/lib/auth-helpers`.
- Produces, todos `"use server"`:
  - `markFixedExpensePaid(expenseId: string, formData: FormData): Promise<void>`
  - `markCardBillPaid(cardId: string, formData: FormData): Promise<void>` — ambas leem `dueDate` (ISO string) e `amount` do FormData
  - `unmarkExpensePayment(paymentId: string): Promise<void>`

  As duas primeiras são usadas com `.bind(null, id)` na Task 4, o que dá uma função `(formData: FormData) => Promise<void>`. A terceira, com `.bind(null, id)` na Task 5, dá `() => Promise<void>` — a assinatura que `DeleteIconButton` espera.

- [ ] **Step 1: Escrever o arquivo de actions**

Criar `src/lib/actions/expense-payment.ts`:

```ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";

const paymentSchema = z.object({
  dueDate: z.coerce.date(),
  amount: z.coerce.number().positive("Valor deve ser maior que zero"),
});

/**
 * Uma ocorrência é identificada pelo dia, não por um instante. Normalizar
 * mantém a chave única estável, não importa que horas venham junto da data.
 */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parsePayment(formData: FormData) {
  const data = paymentSchema.parse({
    dueDate: formData.get("dueDate"),
    amount: formData.get("amount"),
  });
  return { dueDate: startOfDay(data.dueDate), amount: data.amount };
}

export async function markFixedExpensePaid(expenseId: string, formData: FormData) {
  const userId = await requireUserId();
  const { dueDate, amount } = parsePayment(formData);

  const expense = await prisma.fixedExpense.findUnique({ where: { id: expenseId, userId } });
  if (!expense) throw new Error("Despesa não encontrada");

  await prisma.expensePayment.upsert({
    where: { fixedExpenseId_dueDate: { fixedExpenseId: expenseId, dueDate } },
    create: { userId, fixedExpenseId: expenseId, dueDate, amount },
    update: { amount },
  });
  revalidatePath("/");
  revalidatePath("/historico");
}

export async function markCardBillPaid(cardId: string, formData: FormData) {
  const userId = await requireUserId();
  const { dueDate, amount } = parsePayment(formData);

  const card = await prisma.creditCard.findUnique({ where: { id: cardId, userId } });
  if (!card) throw new Error("Cartão não encontrado");

  await prisma.expensePayment.upsert({
    where: { cardId_dueDate: { cardId, dueDate } },
    create: { userId, cardId, dueDate, amount },
    update: { amount },
  });
  revalidatePath("/");
  revalidatePath("/historico");
}

export async function unmarkExpensePayment(paymentId: string) {
  const userId = await requireUserId();
  // deleteMany em vez de delete: filtrar por userId aqui é o que impede
  // apagar o pagamento de outra pessoa, e delete jogaria se não achasse.
  await prisma.expensePayment.deleteMany({ where: { id: paymentId, userId } });
  revalidatePath("/");
  revalidatePath("/historico");
}
```

- [ ] **Step 2: Verificar tipos e lint**

```bash
npx tsc --noEmit && npm run lint
```

Esperado: sem erros. Se `fixedExpenseId_dueDate` ou `cardId_dueDate` não existirem no tipo do `where`, o client não foi regenerado — rodar `npx prisma generate`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/expense-payment.ts
git commit -m ":sparkles: feat: add actions to confirm and undo an expense payment"
```

---

### Task 4: Botão de confirmar pagamento no dashboard

**Files:**
- Create: `src/components/confirm-payment-dialog.tsx`
- Modify: `src/app/(app)/page.tsx`
- Modify: `src/lib/actions/period.ts:15-59` (função `loadBudgetInputs`)

**Interfaces:**
- Consumes: `markFixedExpensePaid` / `markCardBillPaid` (Task 3); `ExpensePaymentInput` e o campo `expensePayments` de `calculateDailyBudget` (Task 2).
- Produces: `<ConfirmPaymentDialog action={...} label={...} dueDate={...} amount={...} />`, onde `action: (formData: FormData) => Promise<void>` é a server action já ligada ao id pelo `.bind` do lado do servidor.

- [ ] **Step 1: Criar o diálogo de confirmação**

É o gêmeo de `src/components/mark-income-received-dialog.tsx`, com uma diferença: em vez de receber um `incomeId` e chamar uma action fixa, recebe a action já ligada. Isso deixa fatura e despesa fixa usarem o mesmo componente — o mesmo padrão de `DeleteIconButton`.

Criar `src/components/confirm-payment-dialog.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/currency-input";

export function ConfirmPaymentDialog({
  action,
  label,
  dueDate,
  amount,
}: {
  action: (formData: FormData) => Promise<void>;
  label: string;
  dueDate: Date;
  amount: number;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await action(formData);
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="secondary" />}>
        Marcar como paga
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar pagamento</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{label}</p>
          {/*
            O instante exato, não uma string "YYYY-MM-DD": formatar a data
            aqui a renderizaria no fuso do browser, o que pode cair um dia
            fora do vencimento que o servidor calculou.
          */}
          <input type="hidden" name="dueDate" value={dueDate.toISOString()} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="payment-amount">Valor pago</Label>
            <CurrencyInput id="payment-amount" name="amount" defaultValue={amount} required />
          </div>
          {error && (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Carregar os pagamentos no dashboard**

Em `src/app/(app)/page.tsx`, no `Promise.all` (~linha 23), adicionar a consulta e o nome na desestruturação. Substituir as linhas 23-30 por:

```tsx
  const [incomes, incomeReceipts, fixedExpenses, creditCards, transactions, categories, expensePayments] =
    await Promise.all([
      prisma.income.findMany({ where: { userId, active: true } }),
      prisma.incomeReceipt.findMany({ where: { userId } }),
      prisma.fixedExpense.findMany({ where: { userId, active: true } }),
      prisma.creditCard.findMany({ where: { userId, active: true }, include: { purchases: true } }),
      prisma.transaction.findMany({ where: { userId }, orderBy: { date: "desc" } }),
      prisma.category.findMany({ where: { userId, active: true }, orderBy: { name: "asc" } }),
      prisma.expensePayment.findMany({ where: { userId } }),
    ]);
```

E dentro do `calculateDailyBudget`, logo depois do array `cardPurchases: ...` (~linha 54), adicionar:

```tsx
    expensePayments: expensePayments.map((p) => ({
      // null vira undefined: period.ts compara os dois lados por igualdade
      // estrita, e null !== undefined faria o pagamento nunca casar.
      fixedExpenseId: p.fixedExpenseId ?? undefined,
      cardId: p.cardId ?? undefined,
      dueDate: p.dueDate,
      amount: Number(p.amount),
    })),
```

- [ ] **Step 3: Levar a identidade do lembrete até o card**

Ainda em `page.tsx`, o array `reminders` (~linhas 80-103) achata os dois tipos de despesa em um `kind: "due"` só, jogando fora o id de quem é a dívida — que é justamente o que o botão precisa. Substituir os dois primeiros blocos do array por:

```tsx
    ...budget.cardBillReminders.map((bill) => ({
      kind: "due" as const,
      key: `card-${bill.cardId}-${bill.dueDate.toISOString()}`,
      label: `Fatura do ${cardNameById.get(bill.cardId) ?? "cartão"}`,
      amount: bill.amount,
      dueDate: bill.dueDate,
      payAction: markCardBillPaid.bind(null, bill.cardId),
    })),
    ...budget.fixedExpenseReminders.map((exp) => ({
      kind: "due" as const,
      key: `expense-${exp.expenseId}-${exp.dueDate.toISOString()}`,
      label: expenseLabelById.get(exp.expenseId) ?? "Despesa fixa",
      amount: exp.amount,
      dueDate: exp.dueDate,
      payAction: markFixedExpensePaid.bind(null, exp.expenseId),
    })),
```

E adicionar os imports no topo do arquivo:

```tsx
import { ConfirmPaymentDialog } from "@/components/confirm-payment-dialog";
import { markCardBillPaid, markFixedExpensePaid } from "@/lib/actions/expense-payment";
```

- [ ] **Step 4: Renderizar o botão no card do lembrete**

Substituir o `<Card>` do ramo `else` (o de `kind === "due"`, ~linhas 170-178) por:

```tsx
                <Card key={reminder.key} className="border-white/5">
                  <CardContent className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="size-4 shrink-0 text-negative" aria-hidden="true" />
                      <p className="text-sm">
                        {reminder.label}: {formatCurrency(reminder.amount)} vence em{" "}
                        {formatDate(reminder.dueDate)}
                      </p>
                    </div>
                    <ConfirmPaymentDialog
                      action={reminder.payAction}
                      label={reminder.label}
                      dueDate={reminder.dueDate}
                      amount={reminder.amount}
                    />
                  </CardContent>
                </Card>
```

- [ ] **Step 5: Incluir os pagamentos no cálculo do fechamento de período**

Sem isso, a sobra do período calculada em `getPendingPeriodClose` usaria estimativas onde já existe valor pago. Em `src/lib/actions/period.ts`, na função `loadBudgetInputs`:

Adicionar a consulta ao `Promise.all` (linhas 16-22) — nova desestruturação e nova linha ao final do array:

```ts
  const [incomes, incomeReceipts, fixedExpenses, creditCards, transactions, expensePayments] =
    await Promise.all([
      prisma.income.findMany({ where: { userId } }),
      prisma.incomeReceipt.findMany({ where: { userId } }),
      prisma.fixedExpense.findMany({ where: { userId } }),
      prisma.creditCard.findMany({ where: { userId }, include: { purchases: true } }),
      prisma.transaction.findMany({ where: { userId } }),
      prisma.expensePayment.findMany({ where: { userId } }),
    ]);
```

E no objeto de retorno (linhas 47-58), adicionar depois de `cardPurchases: cardPurchaseInputs,`:

```ts
    expensePayments: expensePayments.map((p) => ({
      fixedExpenseId: p.fixedExpenseId ?? undefined,
      cardId: p.cardId ?? undefined,
      dueDate: p.dueDate,
      amount: Number(p.amount),
    })),
```

Nada mais muda ali: `getPendingPeriodClose` já faz `calculateDailyBudget({ ...inputs, today })`, então o campo novo flui sozinho.

- [ ] **Step 6: Verificar tipos e lint**

```bash
npx tsc --noEmit && npm run lint && npm test
```

Esperado: tudo passa.

- [ ] **Step 7: Verificar na mão**

Rodar `npm run dev` e abrir o dashboard. Conferir:
1. Cada lembrete de despesa (fatura e despesa fixa) mostra "Marcar como paga"; os de receita continuam com "Marcar como recebida".
2. Confirmar com o valor sugerido: o lembrete some e o **"Você pode gastar hoje" não muda**. Esse é o ponto crítico — se o número subir, o total está caindo junto com o lembrete (rever a Task 2).
3. Confirmar com um valor maior que a estimativa: o "pode gastar hoje" cai proporcionalmente.

- [ ] **Step 8: Commit**

```bash
git add src/components/confirm-payment-dialog.tsx "src/app/(app)/page.tsx" src/lib/actions/period.ts
git commit -m ":sparkles: feat: confirm a payment straight from the reminder"
```

---

### Task 5: Pagamentos confirmados no Histórico

Onde o usuário acompanha o que já pagou, com a opção de desfazer. Regra de soma (ver Global Constraints): despesa fixa entra no total do mês e nas categorias; fatura de cartão fica só como registro, porque as compras dela já estão listadas uma a uma.

**Files:**
- Modify: `src/app/(app)/historico/page.tsx`

**Interfaces:**
- Consumes: `prisma.expensePayment` (Task 1); `unmarkExpensePayment` (Task 3).
- Produces: nada consumido por outras tasks (última).

- [ ] **Step 1: Estender o tipo `HistoryItem`**

Substituir o `type HistoryItem` (linhas 14-22) por:

```tsx
type HistoryItem = {
  id: string;
  kind: "transaction" | "card" | "fixedExpensePayment" | "cardBillPayment";
  description: string;
  amount: number;
  date: Date;
  cardId?: string;
  cardName?: string;
};
```

- [ ] **Step 2: Carregar os pagamentos do mês**

Substituir o `Promise.all` (linhas 41-50) por:

```tsx
  const [transactions, cardPurchases, expensePayments] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId, date: { gte: rangeStart, lt: rangeEnd } },
      include: { category: { select: { name: true } } },
    }),
    prisma.cardPurchase.findMany({
      where: { userId, date: { gte: rangeStart, lt: rangeEnd } },
      include: { card: { select: { name: true } }, category: { select: { name: true } } },
    }),
    // Agrupado pela data em que foi pago, não pelo vencimento: pagar antes do
    // vencimento faz o registro cair no mês em que o dinheiro de fato saiu.
    prisma.expensePayment.findMany({
      where: { userId, paidAt: { gte: rangeStart, lt: rangeEnd } },
      include: {
        fixedExpense: { select: { label: true } },
        card: { select: { name: true } },
      },
    }),
  ]);
```

- [ ] **Step 3: Somar os pagamentos à lista de itens**

Adicionar ao array `items` (linhas 52-69), depois do bloco de `cardPurchases.map`:

```tsx
    ...expensePayments.map((p) => ({
      id: p.id,
      kind: p.cardId ? ("cardBillPayment" as const) : ("fixedExpensePayment" as const),
      description: p.cardId
        ? `Fatura do ${p.card?.name ?? "cartão"}`
        : (p.fixedExpense?.label ?? "Despesa fixa"),
      amount: Number(p.amount),
      date: p.paidAt,
      cardId: p.cardId ?? undefined,
      cardName: p.card?.name,
    })),
```

- [ ] **Step 4: Manter a fatura paga fora dos totais**

Substituir o cálculo de `expenseTotal` e o array `categorized` (linhas 71-79) por:

```tsx
  // Receita é guardada como valor negativo, então fica de fora dos números de
  // gasto — senão cairia num balde de categoria como se fosse despesa e
  // anularia parte do total do mês.
  //
  // A fatura de cartão paga também fica de fora: as compras dela já estão
  // listadas uma a uma acima, e somar a fatura contaria o mesmo dinheiro duas
  // vezes. A despesa fixa paga, essa entra — ela não aparece em nenhum outro
  // lugar do Histórico.
  const countsAsSpending = (item: HistoryItem) =>
    item.amount > 0 && item.kind !== "cardBillPayment";

  const expenseTotal = items.filter(countsAsSpending).reduce((sum, i) => sum + i.amount, 0);

  const categorized = [
    ...transactions.map((t) => ({ amount: Number(t.amount), categoryName: t.category?.name })),
    ...cardPurchases.map((p) => ({ amount: Number(p.amount), categoryName: p.category?.name })),
    // Despesa fixa não tem categoria no modelo, então cai em "Sem categoria".
    ...expensePayments
      .filter((p) => !p.cardId)
      .map((p) => ({ amount: Number(p.amount), categoryName: undefined })),
  ].filter((item) => item.amount > 0);
```

- [ ] **Step 5: Renderizar as linhas de pagamento**

No `TabsContent value="lancamentos"`, o ícone é escolhido por um ternário `item.kind === "card" ? CardIcon : Receipt` e o botão de excluir por outro. Com quatro tipos, ternários aninhados ficam ilegíveis — trocar por lookup.

Adicionar o import do ícone novo na linha 2:

```tsx
import { ChevronLeft, ChevronRight, CreditCard as CardIcon, Receipt, CircleCheck } from "lucide-react";
```

E o import da action, junto dos outros (linha 12):

```tsx
import { unmarkExpensePayment } from "@/lib/actions/expense-payment";
```

Substituir o bloco do ícone (linhas 140-144) por:

```tsx
                    {item.kind === "card" ? (
                      <CardIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    ) : item.kind === "transaction" ? (
                      <Receipt className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    ) : (
                      <CircleCheck className="size-4 shrink-0 text-primary" aria-hidden="true" />
                    )}
```

Substituir o bloco do botão de excluir (linhas 159-169) por:

```tsx
                    {item.kind === "transaction" ? (
                      <DeleteIconButton
                        action={deleteTransaction.bind(null, item.id)}
                        confirmMessage={`Excluir o gasto "${item.description}"?`}
                      />
                    ) : item.kind === "card" ? (
                      <DeleteIconButton
                        action={deleteCardPurchase.bind(null, item.id, item.cardId!)}
                        confirmMessage={`Excluir a compra "${item.description}"?`}
                      />
                    ) : (
                      <DeleteIconButton
                        action={unmarkExpensePayment.bind(null, item.id)}
                        confirmMessage={`Desfazer o pagamento de "${item.description}"? O lembrete volta a aparecer no início.`}
                      />
                    )}
```

- [ ] **Step 6: Rotular a linha de pagamento**

O subtítulo hoje mostra `formatDate(item.date)` mais o nome do cartão. Para pagamento, "pago em" deixa claro que aquela data é o pagamento, não uma compra. Substituir o `<p>` de subtítulo (linhas 147-150) por:

```tsx
                      <p className="text-sm text-muted-foreground">
                        {item.kind === "fixedExpensePayment" || item.kind === "cardBillPayment"
                          ? `Pago em ${formatDate(item.date)}`
                          : formatDate(item.date)}
                        {item.kind === "card" && item.cardName ? ` · ${item.cardName}` : ""}
                      </p>
```

- [ ] **Step 7: Verificar tipos, lint e testes**

```bash
npx tsc --noEmit && npm run lint && npm test
```

Esperado: tudo passa.

- [ ] **Step 8: Verificar na mão**

Com `npm run dev`:
1. Confirmar o pagamento de uma despesa fixa no dashboard → abrir o Histórico do mês corrente: a linha aparece com o ícone de check, "Pago em …", e o total de gastos do mês **sobe** pelo valor pago.
2. Confirmar o pagamento de uma fatura → a linha aparece, mas o total de gastos do mês **não muda** (as compras já estavam contadas).
3. Clicar na lixeira de uma linha de pagamento → confirmar → a linha some do Histórico e o lembrete reaparece no dashboard.
4. Navegar para o mês anterior e voltar: a linha continua no mês em que foi paga.

- [ ] **Step 9: Commit**

```bash
git add "src/app/(app)/historico/page.tsx"
git commit -m ":sparkles: feat: list confirmed payments in the history"
```

---

## Notas de revisão

- **`AGENTS.md` reescrito pelo `next dev`:** o bloco no topo do arquivo é regravado pelo `next dev`. Se aparecer como modificação não commitada, commitar junto com o trabalho em vez de reverter — reverter só recria a alteração.
- **Despesa fixa ligada a cartão** não gera lembrete próprio (ela entra na fatura do cartão), então não ganha botão nenhum — quitar a fatura já a cobre. Comportamento inalterado.
- **Fatura de valor zero** não vira lembrete hoje (`getCardBillsInPeriod` só emite quando `amount > 0`) e portanto não pode ser confirmada. Comportamento inalterado.
- **Desfazer um pagamento** de uma ocorrência de período já fechado faz o lembrete reaparecer se o vencimento ainda cair no período corrente; se não cair, apenas some do Histórico. É o mesmo modelo das receitas.
