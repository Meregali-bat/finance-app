# Saldo em conta na tela de início

**Objetivo:** ver na home quanto dinheiro existe na conta bancária **neste momento** — o que já entrou menos o que já saiu de fato, sem descontar contas que ainda vão vencer.

---

## Context

A home já mostra **"Saldo do período"** (`budget.periodBalance`, `src/lib/period.ts:857`): recebido no período menos **tudo que está comprometido nele**, incluindo faturas e despesas fixas que ainda nem venceram. É um número de planejamento — deliberadamente diferente do que o banco mostra.

O que não existe em lugar nenhum do schema é a conta bancária: não há modelo de conta, nem saldo inicial, nem qualquer marco de "em tal dia eu tinha tanto". Sem um ponto de partida informado pelo usuário, o app só consegue calcular variações, nunca um saldo absoluto.

**Resultado esperado:** um card próprio abaixo do card principal da home, com o saldo real de agora, a data do último ajuste e um botão para corrigir quando o app e o banco discordarem.

### Decisões já tomadas com o usuário

| Decisão | Escolha |
|---|---|
| Que número mostrar | O que tem no banco **agora** — compromissos futuros não descontam |
| Como se mantém | **O app calcula pelos lançamentos e o usuário corrige** quando o banco discordar |
| Caixinhas | Depositar **sai da conta** (dinheiro vai para outro lugar) |
| Onde na tela | **Card próprio** abaixo do card principal, com o valor em destaque |
| Abordagem | **Marco de ajuste + derivação** — nada de saldo persistido e incrementado por action |

---

## Global Constraints

- **Todo texto de UI em pt-BR**, incluindo `aria-label` e mensagens de erro.
- **`src/lib/account-balance.ts` é puro**: nada de `prisma`, `next/*` ou I/O — mesma disciplina de `src/lib/period.ts`.
- **Testes importam por caminho relativo** (`from "./account-balance"`): não existe `vitest.config.ts`, logo não há alias `@/` nos testes.
- **`Decimal` não atravessa para client component.** Converta para `number` na página/action.
- **Datas de calendário** (`occurrenceDate`, `date`) são lidas com `storedDay()` de `period.ts`, nunca com `getDate()` local — ver o comentário em `src/lib/period.ts:104-121`.

---

## Modelo de dados

Um modelo novo, `BalanceAdjustment`:

```prisma
/// Uma leitura do extrato: "neste instante o banco dizia X". O saldo em conta
/// exibido na home é derivado do ajuste mais recente somado a tudo que foi
/// registrado depois dele — ver src/lib/account-balance.ts.
///
/// Cada correção cria uma linha nova; nada é sobrescrito. `createdAt` não é só
/// carimbo de auditoria, é o marco a partir do qual o cálculo soma.
model BalanceAdjustment {
  id        String   @id @default(cuid())
  userId    String
  balance   Decimal
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
}
```

`User` ganha a relação `balanceAdjustments BalanceAdjustment[]`.

Migration escrita à mão em `prisma/migrations/20260911120000_add_balance_adjustment/migration.sql`, com o comentário explicando o porquê, como as existentes. Não há backfill: sem ajuste, não há saldo a mostrar.

---

## Regra de cálculo

`src/lib/account-balance.ts`, função pura `calculateAccountBalance()`:

```
saldoAgora = ajusteMaisRecente.balance
           + Σ IncomeReceipt.amount    (recebimento confirmado)
           − Σ Transaction.amount      (negativo = entrada avulsa, logo soma)
           − Σ ExpensePayment.amount   (fatura ou fixa quitada)
           − Σ JarDeposit.amount       (guardado na caixinha)
```

`CardPurchase` **não entra**: comprar no cartão não tira dinheiro da conta; o débito acontece quando a fatura é paga, e isso já é o `ExpensePayment`.

Cada movimento só entra na soma se passar nos **dois** filtros:

| Filtro | Regra | Por quê |
|---|---|---|
| Registrado depois do marco | `createdAt > ajuste.createdAt` | O que já estava lançado quando você leu o extrato **já está** no valor informado; somar de novo contaria duas vezes |
| Com data até hoje | data do movimento `<=` hoje | Um lançamento marcado para amanhã não pode derrubar o saldo de agora |

Qual campo é a "data do movimento" de cada um:

| Movimento | Registro (marco) | Data (hoje) |
|---|---|---|
| `IncomeReceipt` | `createdAt` | `occurrenceDate` via `storedDay()` |
| `Transaction` | `createdAt` (anulável) | `date` via `storedDay()` |
| `ExpensePayment` | `createdAt` | `paidAt` |
| `JarDeposit` | `createdAt` | `createdAt` (mesmo instante) |

As duas comparações têm granularidades diferentes, e confundi-las é o erro fácil aqui. O filtro do **marco** é por instante (`createdAt > ajuste.createdAt`), porque dois lançamentos do mesmo dia podem cair em lados opostos do ajuste. O filtro de **hoje** é por dia: `occurrenceDate` e `date` viram dia por `storedDay()`, enquanto `paidAt` e `createdAt` são instantes reais e viram dia local — do mesmo jeito que `startOfDay()` faz em `period.ts`. Sem isso, um pagamento confirmado às 22h de hoje cairia fora do "até hoje" e o saldo não registraria dinheiro que já saiu.

**`Transaction.createdAt` é nulo** nas linhas anteriores à migration `20260817124936_add_created_at_to_movements`. Essas nunca entram: são mais velhas do que qualquer ajuste que venha a ser criado, então ignorá-las é o comportamento correto — mas o código diz isso em voz alta, em vez de deixar o `undefined` decidir sozinho.

**Assinatura:**

```ts
export interface AccountBalanceAdjustmentInput {
  balance: number;
  createdAt: Date;
}

export interface AccountMovementInput {
  amount: number;
  /** Quando a linha foi gravada. Nulo nos lançamentos anteriores à coluna. */
  registeredAt?: Date | null;
  /** O dia em que o dinheiro se move de fato. */
  occurredOn: Date;
}

export interface AccountBalanceInput {
  adjustment?: AccountBalanceAdjustmentInput;
  /** Entram somando. */
  credits: AccountMovementInput[];
  /** Entram subtraindo. Lançamento de entrada vem com amount negativo e soma. */
  debits: AccountMovementInput[];
  today: Date;
}

/** Nulo quando nunca houve ajuste: não há saldo a inventar. */
export function calculateAccountBalance(input: AccountBalanceInput): number | null;
```

Créditos e débitos chegam já normalizados pela página — o módulo não conhece `IncomeReceipt` nem `JarDeposit`, só duas listas de movimentos. Isso mantém a regra de filtro em um lugar só, em vez de repetida quatro vezes.

---

## Limitação conhecida e aceita

**Editar ou excluir um movimento anterior ao marco não mexe no saldo** — o `createdAt` dele continua velho, então ele segue fora da soma, e o valor informado no ajuste já o contava com o número antigo.

Isso é inerente à abordagem: o marco congela o passado de propósito, e é justamente o que impede a dupla contagem. A válvula é o próprio botão de corrigir. Decisão confirmada com o usuário: o ajuste manual resolve.

---

## Tela e fluxo

**`src/components/account-balance-card.tsx`** — server component, renderizado na home logo abaixo do card principal:

- **Com saldo**: rótulo "Saldo em conta" (`SectionLabel`), valor grande em `font-heading tabular-nums` — `text-negative` quando negativo, o mesmo tratamento do "estourou o orçamento" —, linha fina "Ajustado em DD/MM" e o botão "Corrigir" no canto.
- **Sem nenhum ajuste**: nada de número inventado. Texto "Informe o saldo da sua conta" e botão "Informar saldo".

**`src/components/forms/balance-adjustment-dialog.tsx`** — client component no molde de `jar-deposit-dialog.tsx`: `CurrencyInput`, label "Quanto o banco mostra agora", botões com estado de `isPending` e erro em `role="alert"`. O texto deixa claro que se digita o **valor do extrato**, não a diferença.

**`src/lib/actions/account-balance.ts`** — `setAccountBalance(formData)`: `requireUserId()`, zod (`amount` numérico, não negativo), cria o `BalanceAdjustment` e `revalidatePath("/")`.

**`src/app/(app)/page.tsx`** — mais duas consultas no `Promise.all` existente: o último `balanceAdjustment` (`orderBy createdAt desc`, `findFirst`) e os `jarDeposit` do usuário. Recebimentos, lançamentos e pagamentos a página já carrega e são reaproveitados.

---

## Testes

`src/lib/account-balance.test.ts`, vitest, importando por caminho relativo:

- sem ajuste → retorna `null`
- movimento registrado **antes** do marco é ignorado
- movimento registrado depois, datado para **amanhã**, é ignorado
- lançamento de entrada (`amount` negativo) **soma** em vez de subtrair
- fatura paga e depósito em caixinha **debitam**
- `registeredAt` nulo é ignorado
- um **segundo ajuste** zera a base: só conta o que veio depois dele
- movimento registrado depois do marco mas datado no **passado** (lançamento esquecido) entra

---

## Fora de escopo

Decidido com o usuário, de propósito:

- **Tela de histórico dos ajustes** — os dados ficam gravados e dá para expor depois.
- **Múltiplas contas bancárias** — uma só.
- **Informar saldo negativo à mão** — o `CurrencyInput` não digita sinal. O saldo *calculado* pode ficar negativo e aparece em vermelho normalmente.
