# Saldo em conta na tela de início — plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development` (recomendada) ou `superpowers:executing-plans` para tocar o plano tarefa a tarefa. Os passos usam checkbox (`- [ ]`). TDD nas tarefas de lib pura. Cada tarefa termina em um commit.

**Goal:** mostrar na home um card com o dinheiro que está na conta bancária **agora**, derivado de um ajuste informado pelo usuário somado ao que foi registrado depois dele.

**Architecture:** um modelo novo (`BalanceAdjustment`) guarda cada leitura do extrato; um módulo puro (`src/lib/account-balance.ts`) deriva o saldo atual a partir do ajuste mais recente e das movimentações registradas depois dele, com data até hoje. Nenhum saldo é persistido e incrementado por action — o número é sempre calculado na leitura, como `period.ts` já faz com o orçamento.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, Prisma 7 + PostgreSQL, zod 4, vitest 4, Tailwind 4, base-ui.

**Spec:** `docs/superpowers/specs/2026-09-11-saldo-em-conta-design.md` — leia antes de começar; este plano argumenta a partir dele.

## Global Constraints

- **Este Next.js não é o que você conhece.** Antes de escrever código de página, action ou form, leia o guia correspondente em `node_modules/next/dist/docs/` — para este plano, `01-app/02-guides/server-actions.md` e `01-app/03-api-reference/04-functions/revalidatePath.md`. É exigência do `AGENTS.md` do repositório.
- **Todo texto de UI em pt-BR**, incluindo `aria-label` e mensagens de erro.
- **`src/lib/account-balance.ts` é puro**: nada de `prisma`, `next/*` ou I/O. É o único arquivo desta feature com teste unitário.
- **Testes importam por caminho relativo** (`from "./account-balance"`): não existe `vitest.config.ts`, logo **não há alias `@/` nos testes**.
- **`Decimal` não atravessa para client component.** Converta com `Number()` na página ou na action.
- **Datas de calendário** (`occurrenceDate`, `date`) são lidas com `storedDay()` de `src/lib/period.ts`, nunca com `getDate()` local. Ver o comentário em `src/lib/period.ts:104-121`.
- **Comentários explicam o porquê, não o quê.** O repositório comenta decisões que não se leem no código (veja `src/lib/period.ts` e as migrations). Siga esse tom; não narre o óbvio.
- Rodar os testes: `npm test`. Lint: `npm run lint`. Build: `npm run build`.
- **O client Prisma gerado localmente está atrás do schema.** `src/generated/prisma` é gitignored — cada máquina gera o seu —, e o desta está anterior à migration `20260820120000`: antes de qualquer mudança deste plano, `npx tsc --noEmit` já acusa 5 erros de `endedAt`/`deletedAt` não existirem. O `npx prisma generate` da Task 1 corrige isso e **não gera nada para commitar**. Se esses 5 erros continuarem depois dele, pare e investigue, porque aí é outra coisa. Não confunda esse ruído de partida com erro seu.
- Se `npx tsc --noEmit` reclamar da combinação `incremental`/`noEmit`, rode `npx tsc --noEmit --incremental false`.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `prisma/schema.prisma` (modificar) | Modelo `BalanceAdjustment` e a relação no `User` |
| `prisma/migrations/20260911120000_add_balance_adjustment/migration.sql` (criar) | Tabela, índice e FK |
| `src/lib/account-balance.ts` (criar) | **Regra de cálculo, pura.** Não conhece Prisma nem nomes de modelo |
| `src/lib/account-balance.test.ts` (criar) | Testes da regra |
| `src/lib/actions/account-balance.ts` (criar) | Server action que grava um ajuste |
| `src/components/forms/balance-adjustment-dialog.tsx` (criar) | Dialog client que coleta o valor do extrato |
| `src/components/account-balance-card.tsx` (criar) | Card da home: valor, data do ajuste, botão |
| `src/app/(app)/page.tsx` (modificar) | Busca os dados, normaliza para o módulo puro, renderiza o card |

O módulo puro recebe duas listas genéricas (`credits` e `debits`) em vez de conhecer `IncomeReceipt`, `Transaction`, `ExpensePayment` e `JarDeposit`. A tradução de cada modelo para essa forma acontece só na página — assim a regra dos dois filtros vive em um lugar, não em quatro.

---

## Task 1: Modelo e migration

**Files:**
- Modify: `prisma/schema.prisma` (modelo `User`, e o fim do arquivo)
- Create: `prisma/migrations/20260911120000_add_balance_adjustment/migration.sql`

**Interfaces:**
- Consumes: nada.
- Produces: `prisma.balanceAdjustment` com os campos `id`, `userId`, `balance` (Decimal), `createdAt`.

- [ ] **Step 1: Adicionar o modelo ao schema**

No fim de `prisma/schema.prisma`:

```prisma
/// Uma leitura do extrato: "neste instante o banco dizia X". O saldo em conta
/// exibido na home é derivado do ajuste mais recente somado a tudo que foi
/// registrado depois dele — ver src/lib/account-balance.ts.
///
/// Cada correção cria uma linha nova; nada é sobrescrito. `createdAt` não é só
/// carimbo de auditoria: é o marco a partir do qual a soma começa.
model BalanceAdjustment {
  id        String   @id @default(cuid())
  userId    String
  balance   Decimal
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
}
```

- [ ] **Step 2: Declarar a relação no `User`**

Em `prisma/schema.prisma`, no modelo `User`, junto das outras listas de relação (depois de `cardBillEstimates`):

```prisma
  balanceAdjustments BalanceAdjustment[]
```

- [ ] **Step 3: Escrever a migration à mão**

Crie `prisma/migrations/20260911120000_add_balance_adjustment/migration.sql`:

```sql
-- Saldo em conta na tela de início.
--
-- O schema não conhece a conta bancária, então o saldo real não é derivável
-- sozinho: falta o ponto de partida. Cada linha aqui é uma leitura do extrato
-- informada pelo usuário, e o saldo exibido soma a partir da mais recente.
--
-- Uma linha por correção em vez de uma coluna sobrescrita: `createdAt` é o
-- marco que separa o que já estava no valor informado do que veio depois —
-- sobrescrever apagaria essa fronteira e o saldo passaria a contar duas vezes.

-- CreateTable
CREATE TABLE "BalanceAdjustment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalanceAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BalanceAdjustment_userId_createdAt_idx" ON "BalanceAdjustment"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "BalanceAdjustment" ADD CONSTRAINT "BalanceAdjustment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 4: Validar o schema e gerar o client**

Rodar:

```bash
npx prisma validate
npx prisma generate
```

Esperado: `The schema at prisma\schema.prisma is valid` e o client gerado sem erro. O `generate` é obrigatório — sem ele `prisma.balanceAdjustment` não existe em TypeScript e as tarefas seguintes não compilam.

- [ ] **Step 5: Aplicar a migration no banco**

Rodar:

```bash
npx prisma migrate deploy
```

Esperado: `1 migration found` e a aplicação de `20260911120000_add_balance_adjustment`. Se não houver `DATABASE_URL` configurada no ambiente, **pare e avise** — não invente uma conexão nem mude o `datasource`.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260911120000_add_balance_adjustment/migration.sql
git commit -m ":sparkles: feat: add the balance adjustment record"
```

---

## Task 2: Regra de cálculo (TDD)

**Files:**
- Create: `src/lib/account-balance.ts`
- Test: `src/lib/account-balance.test.ts`

**Interfaces:**
- Consumes: nada (módulo puro, sem imports do projeto).
- Produces:
  - `calculateAccountBalance(input: AccountBalanceInput): number | null`
  - `AccountBalanceInput { adjustment?: AccountBalanceAdjustmentInput; credits: AccountMovementInput[]; debits: AccountMovementInput[]; today: Date }`
  - `AccountBalanceAdjustmentInput { balance: number; createdAt: Date }`
  - `AccountMovementInput { amount: number; registeredAt?: Date | null; occurredOn: Date }`

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/lib/account-balance.test.ts` — inteiro, de uma vez:

```ts
import { describe, expect, it } from "vitest";
import { calculateAccountBalance } from "./account-balance";
import type { AccountMovementInput } from "./account-balance";

// O ajuste foi feito no dia 10/set às 9h; "agora" são 20h do mesmo dia.
const adjustedAt = new Date(2026, 8, 10, 9, 0);
const now = new Date(2026, 8, 10, 20, 0);
const adjustment = { balance: 1000, createdAt: adjustedAt };

/** Um movimento registrado depois do ajuste e ocorrido hoje, salvo indicação. */
function movement(overrides: Partial<AccountMovementInput> = {}): AccountMovementInput {
  return {
    amount: 100,
    registeredAt: new Date(2026, 8, 10, 10, 0),
    occurredOn: new Date(2026, 8, 10),
    ...overrides,
  };
}

describe("calculateAccountBalance", () => {
  it("não inventa saldo antes do primeiro ajuste", () => {
    const balance = calculateAccountBalance({
      credits: [movement()],
      debits: [],
      today: now,
    });
    expect(balance).toBeNull();
  });

  it("soma o recebimento e subtrai o gasto registrados depois do ajuste", () => {
    const balance = calculateAccountBalance({
      adjustment,
      credits: [movement({ amount: 500 })],
      debits: [movement({ amount: 80 })],
      today: now,
    });
    expect(balance).toBe(1420);
  });

  it("ignora o que já estava lançado quando o extrato foi lido", () => {
    const balance = calculateAccountBalance({
      adjustment,
      credits: [],
      debits: [movement({ registeredAt: new Date(2026, 8, 10, 8, 0) })],
      today: now,
    });
    expect(balance).toBe(1000);
  });

  it("ignora lançamento antigo sem data de registro", () => {
    const balance = calculateAccountBalance({
      adjustment,
      credits: [],
      debits: [movement({ registeredAt: null })],
      today: now,
    });
    expect(balance).toBe(1000);
  });

  it("não deixa o lançamento de amanhã derrubar o saldo de agora", () => {
    const balance = calculateAccountBalance({
      adjustment,
      credits: [],
      debits: [movement({ occurredOn: new Date(2026, 8, 11) })],
      today: now,
    });
    expect(balance).toBe(1000);
  });

  it("conta o lançamento esquecido: registrado hoje, datado ontem", () => {
    const balance = calculateAccountBalance({
      adjustment,
      credits: [],
      debits: [movement({ amount: 30, occurredOn: new Date(2026, 8, 9) })],
      today: now,
    });
    expect(balance).toBe(970);
  });

  it("soma a entrada avulsa, que chega como valor negativo", () => {
    const balance = calculateAccountBalance({
      adjustment,
      credits: [],
      debits: [movement({ amount: -200 })],
      today: now,
    });
    expect(balance).toBe(1200);
  });

  it("conta o pagamento confirmado à noite como movimento de hoje", () => {
    const balance = calculateAccountBalance({
      adjustment,
      credits: [],
      // `paidAt` é um instante real, não um dia de calendário: às 22h ele é
      // maior que a meia-noite de hoje e cairia fora de uma comparação crua.
      debits: [movement({ amount: 50, occurredOn: new Date(2026, 8, 10, 22, 30) })],
      today: now,
    });
    expect(balance).toBe(950);
  });

  it("recomeça do ajuste mais recente, descartando o que veio antes dele", () => {
    const balance = calculateAccountBalance({
      adjustment: { balance: 300, createdAt: new Date(2026, 8, 10, 18, 0) },
      credits: [],
      // Registrado às 10h: já estava no extrato lido às 18h.
      debits: [movement({ amount: 75 })],
      today: now,
    });
    expect(balance).toBe(300);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Rodar: `npm test -- account-balance`

Esperado: FAIL — `Failed to resolve import "./account-balance"`.

- [ ] **Step 3: Escrever a implementação mínima**

Crie `src/lib/account-balance.ts`:

```ts
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
  /** Entram subtraindo. Entrada avulsa chega com `amount` negativo e soma. */
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

/** Nulo quando nunca houve ajuste: não há saldo a inventar. */
export function calculateAccountBalance(input: AccountBalanceInput): number | null {
  const { adjustment, credits, debits, today } = input;
  if (!adjustment) return null;

  const adjustedAt = adjustment.createdAt;
  const todayStart = startOfDay(today).getTime();

  return (
    adjustment.balance +
    sumCounted(credits, adjustedAt, todayStart) -
    sumCounted(debits, adjustedAt, todayStart)
  );
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Rodar: `npm test -- account-balance`

Esperado: PASS, 9 testes.

- [ ] **Step 5: Rodar a suíte inteira**

Rodar: `npm test`

Esperado: PASS — nenhum teste existente quebra (este módulo é novo e não é importado por ninguém ainda).

- [ ] **Step 6: Commit**

```bash
git add src/lib/account-balance.ts src/lib/account-balance.test.ts
git commit -m ":sparkles: feat: derive the current account balance from the latest adjustment"
```

---

## Task 3: Server action

**Files:**
- Create: `src/lib/actions/account-balance.ts`

**Interfaces:**
- Consumes: `prisma.balanceAdjustment` (Task 1).
- Produces: `setAccountBalance(formData: FormData): Promise<void>` — lê o campo `balance` do form.

- [ ] **Step 1: Ler o guia do Next sobre server actions**

Ler `node_modules/next/dist/docs/01-app/02-guides/server-actions.md` e `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md`. Esta versão do Next tem mudanças de API em relação ao que você conhece — confira a assinatura de `revalidatePath` antes de usar.

- [ ] **Step 2: Escrever a action**

Crie `src/lib/actions/account-balance.ts`:

```ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";

// Zero é um saldo legítimo (conta zerada), então a validação para em
// `nonnegative`. O campo vazio é barrado antes, pelo `required` do input.
const balanceSchema = z.object({
  balance: z.coerce.number().nonnegative("Valor não pode ser negativo"),
});

/**
 * Grava uma leitura do extrato. Nunca atualiza a linha anterior: é a sequência
 * de ajustes que permite saber o que já estava contado em cada um.
 */
export async function setAccountBalance(formData: FormData) {
  const userId = await requireUserId();
  const data = balanceSchema.parse({ balance: formData.get("balance") });

  await prisma.balanceAdjustment.create({ data: { userId, balance: data.balance } });
  revalidatePath("/");
}
```

- [ ] **Step 3: Conferir que compila**

Rodar: `npx tsc --noEmit`

Esperado: sem erros. Se `prisma.balanceAdjustment` não existir, o `npx prisma generate` da Task 1 não rodou.

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/account-balance.ts
git commit -m ":sparkles: feat: record a bank statement reading"
```

---

## Task 4: Dialog de ajuste

**Files:**
- Create: `src/components/forms/balance-adjustment-dialog.tsx`

**Interfaces:**
- Consumes: `setAccountBalance` (Task 3), `CurrencyInput` de `@/components/currency-input`.
- Produces: `<BalanceAdjustmentDialog hasBalance={boolean} />` — client component.

- [ ] **Step 1: Escrever o dialog**

Crie `src/components/forms/balance-adjustment-dialog.tsx`, espelhando `src/components/forms/jar-deposit-dialog.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Wallet } from "lucide-react";
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
import { setAccountBalance } from "@/lib/actions/account-balance";

/**
 * O campo abre vazio, sem o saldo calculado preenchido: o valor pedido é o que
 * o banco mostra, e oferecer o número do app de volta convida a confirmar sem
 * conferir — que é justamente o que este ajuste existe para evitar.
 */
export function BalanceAdjustmentDialog({ hasBalance }: { hasBalance: boolean }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await setAccountBalance(formData);
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="secondary" size="sm" className="gap-2" />}>
        <Wallet className="size-4" /> {hasBalance ? "Corrigir" : "Informar saldo"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Saldo em conta</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="balance">Quanto o banco mostra agora</Label>
            <CurrencyInput id="balance" name="balance" required />
            <p className="text-sm text-muted-foreground">
              Abra o app do banco e digite o valor que aparece lá. Daqui para a frente o saldo se
              atualiza sozinho com os seus lançamentos.
            </p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Conferir que compila e passa no lint**

Rodar: `npx tsc --noEmit` e `npm run lint`

Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/forms/balance-adjustment-dialog.tsx
git commit -m ":sparkles: feat: add the dialog to inform the bank balance"
```

---

## Task 5: Card na home

**Files:**
- Create: `src/components/account-balance-card.tsx`
- Modify: `src/app/(app)/page.tsx`

**Interfaces:**
- Consumes: `calculateAccountBalance` (Task 2), `BalanceAdjustmentDialog` (Task 4), `storedDay` de `@/lib/period`.
- Produces: `<AccountBalanceCard balance={number | null} adjustedAt={Date | null} />`.

- [ ] **Step 1: Escrever o card**

Crie `src/components/account-balance-card.tsx` (server component — sem `"use client"`):

```tsx
import { Card, CardContent } from "@/components/ui/card";
import { SectionLabel } from "@/components/page-header";
import { formatCurrency, formatDate } from "@/lib/format";
import { BalanceAdjustmentDialog } from "@/components/forms/balance-adjustment-dialog";

/**
 * Sem nenhum ajuste o card não mostra número: um saldo derivado só das
 * movimentações do app seria uma variação, não um saldo, e exibi-lo como se
 * fosse o do banco seria mentir com precisão de centavos.
 */
export function AccountBalanceCard({
  balance,
  adjustedAt,
}: {
  balance: number | null;
  adjustedAt: Date | null;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <SectionLabel>Saldo em conta</SectionLabel>
          {balance == null ? (
            <p className="text-sm text-muted-foreground">
              Informe o saldo da sua conta para acompanhar quanto você tem agora.
            </p>
          ) : (
            <>
              <p
                className={`font-heading text-3xl leading-tight font-semibold tracking-[-0.02em] tabular-nums ${
                  balance < 0 ? "text-negative" : ""
                }`}
              >
                {formatCurrency(balance)}
              </p>
              {adjustedAt && (
                <p className="text-xs text-muted-foreground">
                  Ajustado em {formatDate(adjustedAt)} · atualizado pelos seus lançamentos
                </p>
              )}
            </>
          )}
        </div>
        <div className="shrink-0 [&>button]:w-full sm:[&>button]:w-auto">
          <BalanceAdjustmentDialog hasBalance={balance != null} />
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Buscar os dados novos na home**

Em `src/app/(app)/page.tsx`, no `Promise.all` existente (começa em `src/app/(app)/page.tsx:24`), acrescente dois nomes na desestruturação — `balanceAdjustment` e `jarDeposits` — e as duas consultas correspondentes no fim do array:

```ts
      prisma.balanceAdjustment.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
      prisma.jarDeposit.findMany({ where: { userId } }),
```

- [ ] **Step 3: Calcular o saldo na home**

Ainda em `src/app/(app)/page.tsx`, logo depois do bloco `const budget = calculateDailyBudget({...})`:

```ts
  // Os quatro modelos viram duas listas genéricas aqui, e não dentro do
  // módulo: a regra dos filtros mora em um lugar só, e `account-balance.ts`
  // segue puro, sem conhecer nome de tabela.
  const accountBalance = calculateAccountBalance({
    adjustment: balanceAdjustment
      ? { balance: Number(balanceAdjustment.balance), createdAt: balanceAdjustment.createdAt }
      : undefined,
    credits: incomeReceipts.map((r) => ({
      amount: Number(r.amount),
      registeredAt: r.createdAt,
      occurredOn: storedDay(r.occurrenceDate),
    })),
    debits: [
      ...transactions.map((t) => ({
        amount: Number(t.amount),
        registeredAt: t.createdAt,
        occurredOn: storedDay(t.date),
      })),
      ...expensePayments.map((p) => ({
        amount: Number(p.amount),
        registeredAt: p.createdAt,
        // `paidAt`, não `dueDate`: o dinheiro sai quando se paga, e uma fatura
        // quitada adiantada sairia do saldo só no vencimento.
        occurredOn: p.paidAt,
      })),
      ...jarDeposits.map((d) => ({
        amount: Number(d.amount),
        registeredAt: d.createdAt,
        occurredOn: d.createdAt,
      })),
    ],
    today,
  });
```

Acrescente os imports no topo do arquivo:

```ts
import { calculateAccountBalance } from "@/lib/account-balance";
import { AccountBalanceCard } from "@/components/account-balance-card";
```

E inclua `storedDay` no import que já existe de `@/lib/period`, que passa a ser:

```ts
import { calculateDailyBudget, fallsOnDay, storedDay } from "@/lib/period";
```

- [ ] **Step 4: Renderizar o card**

Em `src/app/(app)/page.tsx`, logo **depois** do `</Card>` que fecha o card `variant="elevated"` (o do "Você pode gastar hoje") e **antes** da `<div>` que abre as duas listas:

```tsx
      <AccountBalanceCard
        balance={accountBalance}
        adjustedAt={balanceAdjustment?.createdAt ?? null}
      />
```

- [ ] **Step 5: Verificar tipos, lint e build**

Rodar, nesta ordem:

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
```

Esperado: todos sem erro. Se `npm run build` falhar por falta de `DATABASE_URL`, registre isso no relato em vez de contornar.

- [ ] **Step 6: Conferir na tela**

Subir `npm run dev` e abrir a home. Confirmar, nesta ordem:

1. Sem nenhum ajuste: o card mostra o texto de convite e o botão "Informar saldo" — **nenhum valor em reais**.
2. Informar um saldo (ex.: 1.000,00): o card passa a mostrar `R$ 1.000,00` e "Ajustado em <hoje>".
3. Lançar um gasto de R$ 50 com data de hoje: o saldo vira `R$ 950,00`.
4. Lançar um gasto com data de **amanhã**: o saldo **continua** `R$ 950,00`, e o lançamento aparece na seção "Amanhã".

- [ ] **Step 7: Commit**

```bash
git add src/components/account-balance-card.tsx "src/app/(app)/page.tsx"
git commit -m ":sparkles: feat: show the current account balance on the home screen"
```

---

## Fora de escopo

Combinado com o usuário, não faça:

- tela de histórico dos ajustes (os dados ficam gravados; dá para expor depois);
- múltiplas contas bancárias;
- informar saldo **negativo** à mão — o `CurrencyInput` não digita sinal. O saldo *calculado* pode ficar negativo e já aparece em vermelho.
