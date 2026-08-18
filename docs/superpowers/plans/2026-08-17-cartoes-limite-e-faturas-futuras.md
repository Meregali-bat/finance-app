# Cartões: limite, parcelamento e faturas previstas

> **Para quem executa:** os passos usam checkbox (`- [ ]`). Cada tarefa termina em algo testável e num commit. TDD nas tarefas de lib pura.

**Objetivo:** cadastrar o limite de cada cartão, lançar compras parceladas e prever valores em faturas futuras — e ver tudo isso somado na fatura do mês de vencimento e projetado nos próximos 6 meses.

---

## Context

Hoje o app já tem cartão (`CreditCard`), compra no cartão (`CardPurchase`) e calcula a fatura na hora, a partir das compras do ciclo — `getCardBillsInPeriod()` em `src/lib/period.ts:288`. **Não existe tabela de fatura**, e isso está certo: a fatura é derivada. A fatura também já soma como despesa no mês do vencimento (`cardBillTotal`, `src/lib/period.ts:434`), então o pedido "somar no mês de vencimento" **já é o comportamento atual** e não muda.

O que falta são três coisas que hoje não existem em lugar nenhum do schema:

1. **Limite** — `CreditCard` não tem campo de limite, então não há como saber quanto do cartão já está comprometido.
2. **Parcelas** — `CardPurchase` só tem `amount` e `date`. Uma compra de R$ 1.200 em 12x hoje entra inteira numa fatura só, o que estoura o mês da compra e esvazia os 11 seguintes.
3. **Fatura futura manual** — não há como dizer "a fatura de outubro vai ter R$ 300 de coisa que eu não vou cadastrar compra por compra".

E as duas telas de cartão (`cartoes/page.tsx:44`, `cartoes/[id]/page.tsx:46`) só mostram a **próxima** fatura numa janela de 45 dias — sem projeção e sem limite.

**Resultado esperado:** na tela do cartão, uma barra de limite usado/disponível e as 6 próximas faturas; no formulário de compra, um campo de parcelas; e um lançamento de "valor previsto" que soma na fatura de um vencimento escolhido.

### Decisões já tomadas com o usuário

| Decisão | Escolha |
|---|---|
| Valor da compra parcelada | O usuário digita o **total**; o app divide em N parcelas |
| Fatura manual | **Soma** ao que as compras calculam (não substitui) |
| O que consome limite | **Tudo que ainda não foi pago**: faturas em aberto + parcelas futuras |
| Projeção | **6 meses** |
| Relação com lançamentos | Já existe (`CardPurchase`) — não muda |

---

## Global Constraints

- **Todo texto de UI em pt-BR**, incluindo `aria-label` e mensagens de erro.
- **`src/lib/period.ts` continua puro**: nada de `prisma`, `next/*` ou I/O. É o único módulo testado, e os testes importam por caminho relativo (`from "./period"`) porque **não existe `vitest.config.ts`** — sem jsdom, sem alias `@/`.
- **`Decimal` não atravessa para client component.** Converta para `number` na página/action (ver o comentário em `src/app/(app)/cartoes/[id]/page.tsx:58-60`).
- **Datas de calendário** (`dueDate`, `date`) são lidas com `storedDay()` (parte UTC), nunca com `getDate()` local. Ver o comentário em `src/lib/period.ts:104-121`.
- **Nos testes, as duas famílias de data não se misturam.** Declare no topo das suítes novas:

  ```ts
  /** Um dia de calendário como o banco guarda: a intenção mora na parte UTC.
   *  new Date(2026, 0, 27) em fuso positivo é 2026-01-26T22:00Z, e storedDay()
   *  leria dia 26 — o teste passaria no Brasil e falharia em Berlim. */
  const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
  ```

  Use `day(...)` em **toda entrada** que passa por `storedDay()`: `date` de compra, `dueDate` de pagamento e de previsão. Use `new Date(y, m, d)` **local** para o que é instante de verdade (`today`, `createdAt`, `periodStart`/`periodEnd`) **e para os valores esperados** — `dateForDayInMonth` devolve meia-noite local, então `expect(...).toEqual(new Date(2026, 0, 27))` é o lado certo da comparação.
- **A invariante do pagamento não pode quebrar:** fatura paga sai de `cardBillReminders` mas **continua** em `cardBillTotal`, pelo valor pago (`src/lib/period.ts:429-437`). Se o total caísse ao marcar como paga, o orçamento diário daria um salto.
- Commits em `:gitmoji: type: description` (gitmoji **antes** do tipo), como no `git log`.
- SQL de migration anotado em português, no estilo de `prisma/migrations/20260817124936_add_created_at_to_movements/migration.sql`.
- Colunas de dinheiro são `DECIMAL(65,30)`, como todas as outras.
- Verificação: `npm test`, `npm run lint`, `npx tsc --noEmit`.

---

## Arquitetura

Uma fonte de verdade só para "quanto é a fatura que vence no dia X": uma nova função pura `buildCardBills()` em `period.ts`. `getCardBillsInPeriod()` passa a **delegar** para ela, mantendo a assinatura atual (ganha um 6º parâmetro opcional) para que **os 750 testes existentes passem sem edição** — é essa a prova de que o refactor não mudou comportamento.

Parcelamento é expandido **virtualmente na leitura**: uma linha no banco (`amount` = total, `installments` = N), e `period.ts` fatia em N parcelas na hora de montar as faturas. Criar N linhas quebraria `updateCardPurchase`/`deleteCardPurchase` (`src/lib/actions/card.ts:72-98`), que hoje são operações de uma linha, e imprimiria a mesma compra 12 vezes no Histórico.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `prisma/schema.prisma` | `CreditCard.creditLimit`, `CardPurchase.installments`, novo `CardBillEstimate` |
| `src/lib/period.ts` | **(puro)** fatiar parcelas, montar a série de faturas, calcular uso de limite |
| `src/lib/period.test.ts` | testes das três coisas acima + prova do refactor |
| `src/lib/actions/card.ts` | limite no `cardSchema`, parcelas no `purchaseSchema` |
| `src/lib/actions/card-bill-estimate.ts` | **(novo)** criar/apagar valor previsto |
| `src/lib/actions/period.ts` | passar `installments` e previsões para `calculateDailyBudget` |
| `src/app/(app)/cartoes/page.tsx` | barra de limite por cartão |
| `src/app/(app)/cartoes/[id]/page.tsx` | bloco de limite + projeção de 6 faturas + previsões |
| `src/components/card-bill-projection.tsx` | **(novo)** a lista das 6 faturas |
| `src/components/forms/card-form-dialog.tsx` | campo Limite |
| `src/components/forms/card-purchase-form-dialog.tsx` | campo Parcelas |
| `src/components/forms/card-bill-estimate-dialog.tsx` | **(novo)** lançar valor previsto |
| `src/components/forms/movement-form-dialog.tsx` | campo Parcelas (é o fluxo principal de lançamento) |
| `src/lib/format.ts` + `.test.ts` | `installmentLabel()` |
| `src/lib/history-item.ts`, `src/components/movement-row.tsx` | carregar e exibir "12x de R$ 100,00" |

---

## Task 1 — Schema e migration

**Arquivos:** modificar `prisma/schema.prisma`; criar `prisma/migrations/<timestamp>_add_card_limit_installments_and_bill_estimates/migration.sql`.

**Produz:** `CreditCard.creditLimit: Decimal | null`, `CardPurchase.installments: number`, model `CardBillEstimate`.

- [ ] **Passo 1: campos e model no schema**

Em `CreditCard` (`prisma/schema.prisma:142`):

```prisma
  /// Limite total do cartão. Opcional: sem ele a tela não mostra o bloco de
  /// usado/disponível, em vez de fingir um limite que o usuário não informou.
  creditLimit   Decimal?
  billEstimates CardBillEstimate[]
```

> Nome `creditLimit`, não `limit`: `limit` é palavra reservada em SQL e precisaria de aspas em toda migration escrita à mão.

Em `CardPurchase` (`prisma/schema.prisma:158`):

```prisma
  /// Em quantas parcelas a compra foi dividida. 1 = à vista no cartão.
  /// `amount` continua sendo o TOTAL da compra — a parcela é derivada em
  /// src/lib/period.ts, não gravada.
  installments Int @default(1)
```

Model novo, e `cardBillEstimates CardBillEstimate[]` em `User` (`prisma/schema.prisma:13`):

```prisma
/// Um valor previsto que o usuário lança à mão na fatura de um vencimento
/// futuro — a anuidade, o IOF de uma compra em dólar, a parcela de algo
/// comprado fora do app. Soma-se ao que as compras calculam; não substitui.
model CardBillEstimate {
  id          String     @id @default(cuid())
  userId      String
  cardId      String
  /// O vencimento da fatura em que este valor entra. Mesma convenção de
  /// ExpensePayment.dueDate: um dia de calendário, sem horário.
  dueDate     DateTime
  amount      Decimal
  description String
  createdAt   DateTime   @default(now())
  user        User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  card        CreditCard @relation(fields: [cardId], references: [id], onDelete: Cascade)

  @@index([cardId, dueDate])
  @@index([userId])
}
```

> **Sem `@@unique([cardId, dueDate])`**, ao contrário de `ExpensePayment` (`prisma/schema.prisma:120`). Lá a unicidade existe porque há exatamente um ato de pagar a fatura de janeiro, e é isso que deixa `markCardBillPaid` fazer `upsert`. Aqui a anuidade e o IOF podem cair na mesma fatura; a restrição forçaria juntar as duas numa linha e perder as duas descrições. Por isso `description` é obrigatória.

- [ ] **Passo 2: gerar a migration e anotar o SQL**

```bash
npx prisma migrate dev --name add_card_limit_installments_and_bill_estimates
```

Depois abrir o `migration.sql` gerado e inserir os comentários em português:

```sql
-- O limite é opcional: quem não informa não vê o bloco de usado/disponível.
ALTER TABLE "CreditCard" ADD COLUMN "creditLimit" DECIMAL(65,30);

-- Ao contrário do `createdAt` dos lançamentos, aqui o DEFAULT pode preencher as
-- linhas antigas de uma vez: toda compra já gravada foi mesmo em uma parcela,
-- então o 1 é a verdade delas e não um dado inventado.
ALTER TABLE "CardPurchase" ADD COLUMN "installments" INTEGER NOT NULL DEFAULT 1;

-- Sem UNIQUE (cardId, dueDate), ao contrário de ExpensePayment: duas previsões
-- podem cair na mesma fatura — a anuidade e o IOF — e juntá-las numa linha só
-- apagaria a descrição de cada uma.
CREATE TABLE "CardBillEstimate" (...);
```

- [ ] **Passo 3: verificar** — `npx prisma validate`, `npx prisma generate`, `npx tsc --noEmit`, `npm run lint`. Sem teste unitário: não há banco de teste.

- [ ] **Passo 4: commit**

```bash
git add prisma/
git commit -m ":sparkles: feat: add card limit, installments and manual bill estimates"
```

---

## Task 2 — Fatiar a compra parcelada (TDD, puro)

**Arquivos:** modificar `src/lib/period.ts`, `src/lib/period.test.ts`.

**Consome:** os helpers privados já existentes `storedDay`, `dateForDayInMonth`, `addMonths`, `startOfDay`.

**Produz:**
```ts
export interface CardPurchaseInput {
  cardId: string;
  /** O TOTAL da compra, não a parcela. */
  amount: number;
  date: Date;
  /** Em quantas parcelas. Ausente ou 1 = valor inteiro num único ciclo. */
  installments?: number;
}
// privados:
function earliestOccurrenceOnOrAfter(dayOfMonth: number, reference: Date): Date
function normalizeInstallments(installments: number | undefined): number
function installmentSlices(purchase: CardPurchaseInput, closingDay: number):
  { amount: number; cycleEnd: Date }[]
```

- [ ] **Passo 1: escrever os testes que falham**

Em `src/lib/period.test.ts`, dentro do `describe("getCardBillsInPeriod")` existente (linha 510) ou num `describe("compras parceladas")` novo logo abaixo:

```ts
describe("compras parceladas", () => {
  // Cartão que fecha dia 20 e vence dia 27.
  const card = { id: "c1", closingDay: 20, dueDay: 27 };

  it("trata uma compra sem parcelas como uma parcela única no ciclo da compra", () => {
    // A regressão que importa: `installments` ausente tem que dar exatamente a
    // mesma resposta de antes deste campo existir.
    const purchases = [{ cardId: "c1", amount: 300, date: day(2026, 0, 15) }];
    const bills = getCardBillsInPeriod([card], purchases, new Date(2026, 0, 21), new Date(2026, 1, 21));
    expect(bills).toEqual([{ cardId: "c1", dueDate: new Date(2026, 0, 27), amount: 300 }]);
  });

  it("divide o total em parcelas iguais, uma por ciclo", () => {
    const purchases = [{ cardId: "c1", amount: 1200, date: day(2026, 0, 15), installments: 12 }];
    // A compra de 15/jan fecha no ciclo de 20/jan, que vence em 27/jan.
    const jan = getCardBillsInPeriod([card], purchases, new Date(2026, 0, 21), new Date(2026, 1, 21));
    const fev = getCardBillsInPeriod([card], purchases, new Date(2026, 1, 21), new Date(2026, 2, 21));
    expect(jan[0].amount).toBe(100);
    expect(fev[0].amount).toBe(100);
  });

  it("coloca a primeira parcela no ciclo que fecha depois da compra", () => {
    // Comprou 25/jan, depois do fechamento do dia 20: cai na fatura de fevereiro.
    const purchases = [{ cardId: "c1", amount: 400, date: day(2026, 0, 25), installments: 2 }];
    const jan = getCardBillsInPeriod([card], purchases, new Date(2026, 0, 21), new Date(2026, 1, 21));
    const fev = getCardBillsInPeriod([card], purchases, new Date(2026, 1, 21), new Date(2026, 2, 21));
    expect(jan).toEqual([]);
    expect(fev[0].amount).toBe(200);
  });

  it("manda a sobra dos centavos para a primeira parcela", () => {
    // 1000 em 3x não fecha: alguém tem que levar o centavo a mais. Vai para a
    // primeira porque é assim que os bancos fazem, e porque deixa a fatura mais
    // próxima ser a pessimista.
    const slices = installmentSlices(
      { cardId: "c1", amount: 1000, date: day(2026, 0, 15), installments: 3 },
      20,
    );
    expect(slices.map((s) => s.amount)).toEqual([333.34, 333.33, 333.33]);
  });

  it.each([
    [1000, 3],
    [100, 3],
    [0.05, 3],
    [1234.56, 7],
  ])("faz as parcelas de %s em %ix somarem exatamente o total", (total, count) => {
    // Comparado em centavos inteiros de propósito: toBeCloseTo esconderia
    // justamente o erro de arredondamento que este teste existe para pegar.
    const slices = installmentSlices(
      { cardId: "c1", amount: total, date: day(2026, 0, 15), installments: count },
      20,
    );
    const sum = slices.reduce((acc, s) => acc + Math.round(s.amount * 100), 0);
    expect(sum).toBe(Math.round(total * 100));
  });

  it("não deixa o fechamento no dia 31 escorregar ao passar por fevereiro", () => {
    // Fevereiro fecha dia 28. Se o próximo ciclo fosse calculado somando um mês
    // ao 28 já grudado, março fecharia dia 28 em vez de 31 — e o erro seguiria
    // acumulando mês a mês.
    const slices = installmentSlices(
      { cardId: "c2", amount: 400, date: day(2026, 0, 15), installments: 4 },
      31,
    );
    expect(slices.map((s) => s.cycleEnd)).toEqual([
      new Date(2026, 0, 31),
      new Date(2026, 1, 28),
      new Date(2026, 2, 31),
      new Date(2026, 3, 30),
    ]);
  });

  it.each([[0], [-3], [2.5]])("ignora um número de parcelas inválido (%s)", (installments) => {
    // period.ts é puro e não lança: a validação de verdade é do zod na action.
    const purchases = [{ cardId: "c1", amount: 300, date: day(2026, 0, 15), installments }];
    const bills = getCardBillsInPeriod([card], purchases, new Date(2026, 0, 21), new Date(2026, 1, 21));
    expect(bills[0].amount).toBe(300);
  });
});
```

> `installmentSlices` é a única exportação nova desta tarefa — ela é exportada só para ser testada diretamente, que é como o arredondamento e o clamp do dia 31 ficam verificáveis sem passar por seis chamadas de `getCardBillsInPeriod`.

- [ ] **Passo 2: rodar e ver falhar** — `npm test -- period` → falha com `installmentSlices is not defined` e com as parcelas somando o total inteiro numa fatura só.

- [ ] **Passo 3: implementar**

Em `src/lib/period.ts`, junto dos outros helpers de ocorrência (depois da linha 154):

```ts
/** A primeira ocorrência de dayOfMonth em ou depois de reference. */
function earliestOccurrenceOnOrAfter(dayOfMonth: number, reference: Date): Date {
  const ref = startOfDay(reference);
  const candidate = dateForDayInMonth(ref.getFullYear(), ref.getMonth(), dayOfMonth);
  if (candidate.getTime() >= ref.getTime()) return candidate;
  const next = addMonths(ref.getFullYear(), ref.getMonth(), 1);
  return dateForDayInMonth(next.year, next.month, dayOfMonth);
}

/** Sem parcelamento válido, é uma parcela. Puro: não lança. */
function normalizeInstallments(installments: number | undefined): number {
  if (installments == null || !Number.isInteger(installments) || installments < 1) return 1;
  return installments;
}

/**
 * As parcelas de uma compra, uma por ciclo, a partir do primeiro fechamento em
 * ou depois do dia da compra.
 *
 * O ciclo de cada parcela é re-derivado de (ano, mês, closingDay) a cada passo,
 * nunca somando um mês ao ciclo anterior: com fechamento no dia 31, fevereiro
 * gruda em 28, e somar um mês a esse 28 daria 28/mar em vez de 31/mar.
 *
 * A sobra dos centavos vai toda para a primeira parcela — é o que os bancos
 * fazem, e deixa a fatura mais próxima ser a pessimista.
 */
export function installmentSlices(
  purchase: CardPurchaseInput,
  closingDay: number,
): { amount: number; cycleEnd: Date }[] {
  const count = normalizeInstallments(purchase.installments);
  const cents = Math.round(purchase.amount * 100);
  const base = Math.floor(cents / count);
  const remainder = cents - base * count;
  const firstClose = earliestOccurrenceOnOrAfter(closingDay, storedDay(purchase.date));

  return Array.from({ length: count }, (_, i) => {
    const { year, month } = addMonths(firstClose.getFullYear(), firstClose.getMonth(), i);
    return {
      amount: (base + (i === 0 ? remainder : 0)) / 100,
      cycleEnd: dateForDayInMonth(year, month, closingDay),
    };
  });
}
```

Depois, em `getCardBillsInPeriod` (`src/lib/period.ts:303-310`), troque o filtro por data pelo casamento de ciclo:

```ts
      const purchaseAmount = purchases
        .filter((p) => p.cardId === card.id)
        .flatMap((p) => installmentSlices(p, card.closingDay))
        .filter((slice) => slice.cycleEnd.getTime() === cycleEnd.getTime())
        .reduce((sum, slice) => sum + slice.amount, 0);
```

> Para uma parcela só, isso é **provadamente** o mesmo que o predicado antigo `cycleStart < storedDay(p.date) <= cycleEnd`: fechamentos consecutivos são estritamente crescentes mesmo com o clamp, então `c_{i-1} < d <= c_i` ⟺ `c_i = min{c >= d}`. Os dois lados da comparação são saída de `dateForDayInMonth` (meia-noite local), então `getTime()` é seguro.

- [ ] **Passo 4: rodar tudo** — `npm test`. Os 8 testes de `getCardBillsInPeriod` (linhas 513-585) e as suítes de `calculateDailyBudget` **passam sem edição**. Se algum precisar mudar, a equivalência acima está errada — pare e investigue, não ajuste o teste.

- [ ] **Passo 5: commit**

```bash
git add src/lib/period.ts src/lib/period.test.ts
git commit -m ":sparkles: feat: split an installment purchase across the cycles that bill it"
```

---

## Task 3 — `buildCardBills`: uma fonte de verdade só (TDD, puro)

**Arquivos:** modificar `src/lib/period.ts`, `src/lib/period.test.ts`.

**Consome:** `installmentSlices` (Task 2), `latestOccurrenceBefore`, `findExpensePayment`, `isOccurrenceValid`, `earliestOccurrenceOnOrAfter`.

**Produz:**
```ts
export interface CardBillEstimateInput { cardId: string; dueDate: Date; amount: number }

export interface CardBill {
  cardId: string;
  dueDate: Date;
  cycleStart: Date;
  cycleEnd: Date;
  amount: number;              // previsto: parcelas + assinaturas + previsões
  purchaseAmount: number;
  fixedExpenseAmount: number;
  estimateAmount: number;
  paid: boolean;
  paidAmount?: number;
}

export function buildCardBills(input: {
  card: CreditCardInput;
  purchases: CardPurchaseInput[];
  cardFixedExpenses?: FixedExpenseInput[];
  billEstimates?: CardBillEstimateInput[];
  expensePayments?: ExpensePaymentInput[];
  /** A série começa no primeiro vencimento em ou depois deste dia. */
  from: Date;
  /** Quantos vencimentos consecutivos devolver. */
  months: number;
}): CardBill[];
```

- [ ] **Passo 1: escrever os testes que falham**

```ts
describe("buildCardBills", () => {
  const card = { id: "c1", closingDay: 20, dueDay: 27 };

  it("devolve uma fatura por vencimento, em ordem, pelos meses pedidos", () => {
    // occurrencesInRange nunca conseguiu isso: ele só varre 3 meses.
    const bills = buildCardBills({ card, purchases: [], from: new Date(2026, 0, 1), months: 6 });
    expect(bills.map((b) => b.dueDate)).toEqual([
      new Date(2026, 0, 27), new Date(2026, 1, 27), new Date(2026, 2, 27),
      new Date(2026, 3, 27), new Date(2026, 4, 27), new Date(2026, 5, 27),
    ]);
  });

  it("atravessa a virada do ano sem repetir vencimento", () => {
    const bills = buildCardBills({ card, purchases: [], from: new Date(2026, 10, 1), months: 4 });
    expect(bills.map((b) => b.dueDate)).toEqual([
      new Date(2026, 10, 27), new Date(2026, 11, 27),
      new Date(2027, 0, 27), new Date(2027, 1, 27),
    ]);
  });

  it("mantém o dia do vencimento colado no mês, sem escorregar", () => {
    const card31 = { id: "c2", closingDay: 10, dueDay: 31 };
    const bills = buildCardBills({ card: card31, purchases: [], from: new Date(2026, 0, 1), months: 4 });
    expect(bills.map((b) => b.dueDate)).toEqual([
      new Date(2026, 0, 31), new Date(2026, 1, 28), new Date(2026, 2, 31), new Date(2026, 3, 30),
    ]);
  });

  it("devolve fatura zerada nos meses sem nada", () => {
    // Ao contrário de getCardBillsInPeriod, que omite as vazias: uma projeção
    // que pula mês desalinha a linha do tempo na tela.
    const bills = buildCardBills({ card, purchases: [], from: new Date(2026, 0, 1), months: 3 });
    expect(bills.every((b) => b.amount === 0)).toBe(true);
    expect(bills).toHaveLength(3);
  });

  it("marca a fatura como paga e guarda o valor realmente pago", () => {
    const purchases = [{ cardId: "c1", amount: 300, date: day(2026, 0, 15) }];
    const payments = [{ cardId: "c1", dueDate: day(2026, 0, 27), amount: 290 }];
    const [bill] = buildCardBills({
      card, purchases, expensePayments: payments, from: new Date(2026, 0, 1), months: 1,
    });
    expect(bill.paid).toBe(true);
    expect(bill.paidAmount).toBe(290);
    expect(bill.amount).toBe(300); // o previsto não muda; quem aplica o pago é quem consome
  });

  it("soma a previsão manual ao que as compras já calculam, sem substituir", () => {
    const purchases = [{ cardId: "c1", amount: 200, date: day(2026, 0, 15) }];
    const estimates = [{ cardId: "c1", dueDate: day(2026, 0, 27), amount: 800 }];
    const [bill] = buildCardBills({
      card, purchases, billEstimates: estimates, from: new Date(2026, 0, 1), months: 1,
    });
    expect(bill.amount).toBe(1000);
  });

  it("separa quanto veio de compra, de assinatura e de previsão", () => {
    const [bill] = buildCardBills({
      card,
      purchases: [{ cardId: "c1", amount: 200, date: day(2026, 0, 15) }],
      // createdAt é instante de verdade, por isso local.
      cardFixedExpenses: [{ id: "f1", amount: 50, cardId: "c1", createdAt: new Date(2025, 11, 1) }],
      billEstimates: [{ cardId: "c1", dueDate: day(2026, 0, 27), amount: 800 }],
      from: new Date(2026, 0, 1),
      months: 1,
    });
    expect(bill).toMatchObject({
      purchaseAmount: 200, fixedExpenseAmount: 50, estimateAmount: 800, amount: 1050,
    });
  });

  it("casa a previsão pelo dia do vencimento, ignorando a hora", () => {
    // Mesma armadilha de findExpensePayment: o banco grava meia-noite do fuso de
    // quem gravou, então o dia pretendido está na parte UTC.
    const estimates = [{ cardId: "c1", dueDate: new Date(Date.UTC(2026, 0, 27, 3, 0)), amount: 500 }];
    const [bill] = buildCardBills({
      card, purchases: [], billEstimates: estimates, from: new Date(2026, 0, 1), months: 1,
    });
    expect(bill.estimateAmount).toBe(500);
  });
});
```

E um teste dentro do `describe("getCardBillsInPeriod")` existente:

```ts
  it("soma a previsão manual à fatura do período", () => {
    const cards = [{ id: "c1", closingDay: 20, dueDay: 27 }];
    const estimates = [{ cardId: "c1", dueDate: day(2026, 0, 27), amount: 700 }];
    const bills = getCardBillsInPeriod(
      cards, [], new Date(2026, 0, 21), new Date(2026, 1, 21), [], estimates,
    );
    expect(bills).toEqual([{ cardId: "c1", dueDate: new Date(2026, 0, 27), amount: 700 }]);
  });
```

- [ ] **Passo 2: rodar e ver falhar** — `npm test -- period` → `buildCardBills is not defined`.

- [ ] **Passo 3: implementar**

```ts
/**
 * Os próximos `months` vencimentos a partir de `from`.
 *
 * Substitui occurrencesInRange (que só varre start-1, start, start+1 e por isso
 * não alcança seis meses): aqui a caminhada é contada, não varrida. O dia é
 * re-derivado a cada passo por dateForDayInMonth, senão um vencimento no dia 31
 * grudaria em 28 ao passar por fevereiro e nunca mais voltaria ao 31.
 */
function dueDatesFrom(dueDay: number, from: Date, months: number): Date[] {
  const first = earliestOccurrenceOnOrAfter(dueDay, from);
  return Array.from({ length: months }, (_, i) => {
    const { year, month } = addMonths(first.getFullYear(), first.getMonth(), i);
    return dateForDayInMonth(year, month, dueDay);
  });
}

/**
 * A série de faturas de um cartão: o que cada uma cobra, de onde vem cada
 * pedaço, e se já foi paga. Fonte única de "quanto é a fatura que vence no dia
 * X" — getCardBillsInPeriod e getCardLimitUsage os dois saem daqui.
 *
 * Devolve TODAS as faturas da janela, inclusive as zeradas: quem quiser omitir
 * as vazias filtra depois.
 */
export function buildCardBills(input: {
  card: CreditCardInput;
  purchases: CardPurchaseInput[];
  cardFixedExpenses?: FixedExpenseInput[];
  billEstimates?: CardBillEstimateInput[];
  expensePayments?: ExpensePaymentInput[];
  from: Date;
  months: number;
}): CardBill[] {
  const {
    card, purchases, cardFixedExpenses = [], billEstimates = [],
    expensePayments = [], from, months,
  } = input;

  const slices = purchases
    .filter((p) => p.cardId === card.id)
    .flatMap((p) => installmentSlices(p, card.closingDay));

  return dueDatesFrom(card.dueDay, from, months).map((dueDate) => {
    const cycleEnd = latestOccurrenceBefore(card.closingDay, dueDate);
    const cycleStart = latestOccurrenceBefore(card.closingDay, cycleEnd);

    const purchaseAmount = slices
      .filter((s) => s.cycleEnd.getTime() === cycleEnd.getTime())
      .reduce((sum, s) => sum + s.amount, 0);

    // Uma assinatura no cartão não tem vencimento próprio: entra em todo ciclo
    // que fecha em ou depois de ela ter sido cadastrada.
    const fixedExpenseAmount = cardFixedExpenses
      .filter((exp) => exp.cardId === card.id)
      .filter((exp) => isOccurrenceValid(cycleEnd, exp.createdAt))
      .reduce((sum, exp) => sum + exp.amount, 0);

    const estimateAmount = billEstimates
      .filter((e) => e.cardId === card.id)
      .filter((e) => storedDay(e.dueDate).getTime() === dueDate.getTime())
      .reduce((sum, e) => sum + e.amount, 0);

    const payment = findExpensePayment(expensePayments, { cardId: card.id }, dueDate);

    return {
      cardId: card.id,
      dueDate,
      cycleStart,
      cycleEnd,
      amount: purchaseAmount + fixedExpenseAmount + estimateAmount,
      purchaseAmount,
      fixedExpenseAmount,
      estimateAmount,
      paid: !!payment,
      paidAmount: payment?.amount,
    };
  });
}
```

E `getCardBillsInPeriod` passa a delegar, mantendo os 5 parâmetros e ganhando o 6º opcional (mesmo estilo de `cardFixedExpenses` na linha 293):

```ts
export function getCardBillsInPeriod(
  cards: CreditCardInput[],
  purchases: CardPurchaseInput[],
  periodStart: Date,
  periodEnd: Date,
  cardFixedExpenses: FixedExpenseInput[] = [],
  billEstimates: CardBillEstimateInput[] = [],
): CardBillReminder[] {
  return cards.flatMap((card) =>
    // Dois vencimentos bastam: um período vai de um pagamento ao seguinte, e a
    // série já começa no primeiro vencimento em ou depois de periodStart — não
    // existe borda de baixo para filtrar.
    buildCardBills({
      card, purchases, cardFixedExpenses, billEstimates,
      // De propósito sem expensePayments: esta função devolve o PREVISTO.
      // Quem aplica o valor pago é calculateDailyBudget, e é lá que vive a
      // invariante "fatura paga sai do lembrete mas fica no total".
      expensePayments: [],
      from: periodStart,
      months: 2,
    })
      .filter((bill) => bill.dueDate.getTime() < periodEnd.getTime() && bill.amount > 0)
      .map((bill) => ({ cardId: card.id, dueDate: bill.dueDate, amount: bill.amount })),
  );
}
```

> O filtro `amount > 0` fica **aqui**, não em `buildCardBills`, para preservar ao pé da letra o contrato testado em `period.test.ts:538-541` ("omits cards with no purchases in the cycle").

Em `calculateDailyBudget`, o input ganha `billEstimates?: CardBillEstimateInput[]` (desestruturado com `= []`) e a chamada da linha 422 ganha o 6º argumento. **As linhas 429-437 não são tocadas.**

- [ ] **Passo 4: rodar tudo** — `npm test`. Nenhum teste antigo editado.

- [ ] **Passo 5: commits** (dois, porque são duas coisas)

```bash
git add src/lib/period.ts src/lib/period.test.ts
git commit -m ":recycle: refactor: build every card bill from one place"
git commit -m ":sparkles: feat: add a manually predicted amount to a card bill"
```

---

## Task 4 — `getCardLimitUsage` (TDD, puro)

**Arquivos:** modificar `src/lib/period.ts`, `src/lib/period.test.ts`.

**Consome:** `buildCardBills` (Task 3).

**Produz:**
```ts
export interface CardLimitUsage {
  limit: number;
  used: number;
  available: number;   // nunca negativo
  percentUsed: number; // 0..100, arredondado
  overdueBillCount: number;
}

export function getCardLimitUsage(input: {
  card: CreditCardInput & { creditLimit?: number };
  purchases: CardPurchaseInput[];
  cardFixedExpenses?: FixedExpenseInput[];
  billEstimates?: CardBillEstimateInput[];
  expensePayments?: ExpensePaymentInput[];
  today: Date;
}): CardLimitUsage | null;   // null = cartão sem limite informado
```

### A regra da fatura vencida e nunca marcada

Se "usado = tudo não pago", uma fatura antiga que o usuário esqueceu de marcar como paga comeria o limite **para sempre**. A regra: a caminhada começa **3 meses atrás**, e o que venceu antes disso sai do cálculo sozinho.

```ts
/**
 * Quanto tempo uma fatura vencida continua ocupando o limite sem confirmação.
 * Pagar alguns dias atrasado é normal, então zerar no vencimento liberaria o
 * limite justo quando o dinheiro ainda não saiu. Já uma fatura de meio ano
 * atrás quase certamente foi paga e só não foi marcada — mantê-la comeria o
 * limite para sempre, e quem pagaria o preço do esquecimento é o usuário.
 *
 * Mesma escolha que PRE_REGISTRATION_GRACE_DAYS faz para renda não confirmada:
 * limitar até onde vale perseguir uma confirmação, em vez de varrer a história
 * toda.
 */
const LIMIT_LOOKBACK_MONTHS = 3;
```

O horizonte **para frente é derivado**, não fixo: vai até a última parcela e a última previsão que existirem, para um 18x ser coberto inteiro sem varrer 48 meses fixos.

- [ ] **Passo 1: escrever os testes que falham**

```ts
describe("getCardLimitUsage", () => {
  const card = { id: "c1", closingDay: 20, dueDay: 27, creditLimit: 5000 };
  const today = new Date(2026, 2, 10); // 10/mar/2026

  it("devolve nulo quando o cartão não tem limite informado", () => {
    const usage = getCardLimitUsage({
      card: { id: "c1", closingDay: 20, dueDay: 27 }, purchases: [], today,
    });
    expect(usage).toBeNull();
  });

  it("soma as faturas em aberto e as parcelas futuras no usado", () => {
    const purchases = [
      { cardId: "c1", amount: 900, date: day(2026, 1, 15) },                   // fatura 27/fev
      { cardId: "c1", amount: 1200, date: day(2026, 2, 5), installments: 4 },  // 300 x4
    ];
    const usage = getCardLimitUsage({ card, purchases, today })!;
    expect(usage.used).toBe(2100);
    expect(usage.available).toBe(2900);
  });

  it("libera o limite quando a fatura é marcada como paga", () => {
    const purchases = [{ cardId: "c1", amount: 900, date: day(2026, 1, 15) }];
    const payments = [{ cardId: "c1", dueDate: day(2026, 1, 27), amount: 900 }];
    const usage = getCardLimitUsage({ card, purchases, expensePayments: payments, today })!;
    expect(usage.used).toBe(0);
    expect(usage.available).toBe(5000);
  });

  it("alcança a última parcela de um parcelado de 18x", () => {
    // O horizonte é derivado das parcelas: com uma janela fixa de 6 meses, dois
    // terços do comprometido ficariam invisíveis.
    const purchases = [{ cardId: "c1", amount: 1800, date: day(2026, 2, 5), installments: 18 }];
    const usage = getCardLimitUsage({ card, purchases, today })!;
    expect(usage.used).toBe(1800);
  });

  it("conta a fatura vencida no mês passado que ainda não foi paga", () => {
    const purchases = [{ cardId: "c1", amount: 400, date: day(2026, 1, 15) }];
    const usage = getCardLimitUsage({ card, purchases, today })!;
    expect(usage.used).toBe(400);
    expect(usage.overdueBillCount).toBe(1);
  });

  it("esquece a fatura vencida há mais de três meses que nunca foi marcada como paga", () => {
    // Compra de 15/out/2025: a fatura venceu em 27/out, e a janela do limite só
    // começa no primeiro vencimento em ou depois de 10/dez/2025 — ou seja,
    // 27/dez. Quase certamente foi paga e só não foi marcada.
    const purchases = [{ cardId: "c1", amount: 400, date: day(2025, 9, 15) }];
    const usage = getCardLimitUsage({ card, purchases, today })!;
    expect(usage.used).toBe(0);
    expect(usage.overdueBillCount).toBe(0);
  });

  it("não deixa o disponível ficar negativo quando o comprometido passa do limite", () => {
    const purchases = [{ cardId: "c1", amount: 8000, date: day(2026, 1, 15) }];
    const usage = getCardLimitUsage({ card, purchases, today })!;
    expect(usage.available).toBe(0);
    expect(usage.percentUsed).toBe(100);
  });

  it("conta a previsão manual no comprometido", () => {
    const estimates = [{ cardId: "c1", dueDate: day(2026, 3, 27), amount: 600 }];
    const usage = getCardLimitUsage({ card, purchases: [], billEstimates: estimates, today })!;
    expect(usage.used).toBe(600);
  });
});
```

- [ ] **Passo 2: rodar e ver falhar** — `npm test -- period`.

- [ ] **Passo 3: implementar**

```ts
function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

export function getCardLimitUsage(input: {
  card: CreditCardInput & { creditLimit?: number };
  purchases: CardPurchaseInput[];
  cardFixedExpenses?: FixedExpenseInput[];
  billEstimates?: CardBillEstimateInput[];
  expensePayments?: ExpensePaymentInput[];
  today: Date;
}): CardLimitUsage | null {
  const { card, purchases, cardFixedExpenses = [], billEstimates = [],
          expensePayments = [], today } = input;
  const limit = card.creditLimit;
  if (limit == null || limit <= 0) return null;

  const todayStart = startOfDay(today);
  const lookback = addMonths(todayStart.getFullYear(), todayStart.getMonth(), -LIMIT_LOOKBACK_MONTHS);
  const from = dateForDayInMonth(lookback.year, lookback.month, todayStart.getDate());

  // O horizonte vai até a última parcela e a última previsão que existirem. O
  // +2 cobre a distância entre um ciclo fechar e a fatura que o cobra vencer.
  const slices = purchases
    .filter((p) => p.cardId === card.id)
    .flatMap((p) => installmentSlices(p, card.closingDay));
  const lastRelevant = [
    todayStart,
    ...slices.map((s) => s.cycleEnd),
    ...billEstimates.filter((e) => e.cardId === card.id).map((e) => storedDay(e.dueDate)),
  ].reduce((latest, d) => (d.getTime() > latest.getTime() ? d : latest), todayStart);
  const months = Math.max(4, monthsBetween(from, lastRelevant) + 2);

  const bills = buildCardBills({
    card, purchases, cardFixedExpenses, billEstimates, expensePayments, from, months,
  });
  const open = bills.filter((bill) => !bill.paid && bill.amount > 0);

  const used = open.reduce((sum, bill) => sum + bill.amount, 0);
  return {
    limit,
    used,
    available: Math.max(0, limit - used),
    percentUsed: Math.min(100, Math.round((used / limit) * 100)),
    overdueBillCount: open.filter((bill) => bill.dueDate.getTime() < todayStart.getTime()).length,
  };
}
```

- [ ] **Passo 4: rodar** — `npm test`

- [ ] **Passo 5: commit**

```bash
git add src/lib/period.ts src/lib/period.test.ts
git commit -m ":sparkles: feat: compute how much of a card's limit is committed"
```

---

## Task 5 — Server actions

**Arquivos:** modificar `src/lib/actions/card.ts`; criar `src/lib/actions/card-bill-estimate.ts`.

**Produz:** `createCardBillEstimate(cardId, formData)`, `deleteCardBillEstimate(id, cardId)`; `cardSchema` com `creditLimit`, `purchaseSchema` com `installments`.

- [ ] **Passo 1: limite no `cardSchema`** (`src/lib/actions/card.ts:8`)

```ts
const cardSchema = z.object({
  name: z.string().trim().min(1, "Informe um nome").max(80),
  closingDay: z.coerce.number().int().min(1).max(31),
  dueDay: z.coerce.number().int().min(1).max(31),
  creditLimit: z.coerce.number().positive("Limite deve ser maior que zero").optional(),
});
```

Nas duas actions, ao ler do form:

```ts
    // `|| undefined` é carga pesada: CurrencyInput manda "" quando está vazio, e
    // z.coerce.number() transforma "" (e null) em 0 — o que passaria a valer
    // como "limite zero" em vez de "sem limite".
    creditLimit: formData.get("creditLimit") || undefined,
```

E em `updateCreditCard` grave explicitamente o nulo, senão apagar o campo não limpa a coluna:

```ts
  await prisma.creditCard.update({
    where: { id, userId },
    data: { ...data, creditLimit: data.creditLimit ?? null },
  });
```

- [ ] **Passo 2: parcelas no `purchaseSchema`** (`src/lib/actions/card.ts:47`)

```ts
  installments: z.coerce.number().int().min(1).max(48).default(1),
```

Lido com `installments: formData.get("installments") ?? 1` nas duas actions de compra.

- [ ] **Passo 3: criar `src/lib/actions/card-bill-estimate.ts`**

Seguindo o padrão de `src/lib/actions/expense-payment.ts` — inclusive a checagem de que o cartão é do usuário (`expense-payment.ts:49-50`) e a normalização da data:

```ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";

const estimateSchema = z.object({
  description: z.string().trim().min(1, "Informe uma descrição").max(120),
  amount: z.coerce.number().positive("Valor deve ser maior que zero"),
  dueDate: z.coerce.date(),
});

/** O dia do vencimento, sem horário — a mesma identidade de ExpensePayment. */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export async function createCardBillEstimate(cardId: string, formData: FormData) {
  const userId = await requireUserId();
  const data = estimateSchema.parse({
    description: formData.get("description"),
    amount: formData.get("amount"),
    dueDate: formData.get("dueDate"),
  });

  const card = await prisma.creditCard.findUnique({ where: { id: cardId, userId } });
  if (!card) throw new Error("Cartão não encontrado");

  await prisma.cardBillEstimate.create({
    data: { ...data, dueDate: startOfDay(data.dueDate), cardId, userId },
  });

  revalidatePath(`/cartoes/${cardId}`);
  revalidatePath("/cartoes");
  revalidatePath("/");
}

export async function deleteCardBillEstimate(id: string, cardId: string) {
  const userId = await requireUserId();
  await prisma.cardBillEstimate.delete({ where: { id, userId } });

  revalidatePath(`/cartoes/${cardId}`);
  revalidatePath("/cartoes");
  revalidatePath("/");
}
```

- [ ] **Passo 4: verificar** — sem teste unitário (`"use server"` + prisma, sem banco de teste). `npx tsc --noEmit` e `npm run lint`. Depois, em `npm run dev`: criar um cartão com limite, uma compra 12x e uma previsão; confirmar as linhas em `npx prisma studio`; **apagar o campo de limite e confirmar que a coluna vai a NULL** (é o caso que o `?? null` cobre).

- [ ] **Passo 5: commit**

```bash
git add src/lib/actions/
git commit -m ":sparkles: feat: accept a limit, an installment count and predicted bill amounts"
```

---

## Task 6 — Ligar os novos dados em todos os pontos de cálculo ⚠️

**Esta é a tarefa arriscada.** Quatro lugares mapeiam compras do Prisma para `CardPurchaseInput` e nenhum passa `installments`. Como o campo é **opcional**, o `tsc` **não reclama** e toda compra 12x seria cobrada como 1x em silêncio — a tela mostraria "Próxima fatura: R$ 1.200,00". Os quatro têm que ser atualizados juntos.

**Arquivos:** `src/lib/actions/period.ts:44-46`, `src/app/(app)/page.tsx` (~linhas 33, 58-61), `src/app/(app)/cartoes/page.tsx:14-18,39-44`, `src/app/(app)/cartoes/[id]/page.tsx:26-31,41-46`.

- [ ] **Passo 1: corrigir o bug das assinaturas nas telas de cartão** (commit separado)

`cartoes/page.tsx:44` e `cartoes/[id]/page.tsx:46` chamam `getCardBillsInPeriod` com **4 argumentos**, sem `cardFixedExpenses` — então assinaturas cobradas no cartão ficam fora do número dessas telas, enquanto o dashboard as inclui (`period.ts:422-428`). As duas telas discordam hoje. Corrigir aqui, antes de o mesmo número virar barra de limite e projeção de 6 meses.

Nas duas páginas, no `findMany`/`findUnique`, adicionar `fixedExpenses: { where: { active: true } }` ao `include`, mapear para `FixedExpenseInput` (`amount: Number(e.amount)`, `cardId: e.cardId ?? undefined`, `createdAt: e.createdAt`) e passar como 5º argumento.

```bash
git commit -m ":bug: fix: count card subscriptions in the figures on the cards screens"
```

- [ ] **Passo 2: passar `installments` nos quatro mapeamentos**

Em cada um, `{ cardId: c.id, amount: Number(p.amount), date: p.date }` ganha `installments: p.installments`.

- [ ] **Passo 3: carregar as previsões nos quatro pontos**

`prisma.cardBillEstimate.findMany({ where: { userId } })` (ou `include: { billEstimates: true }` nas páginas de cartão), mapeado para `CardBillEstimateInput` com `amount: Number(e.amount)`, e passado como 6º argumento de `getCardBillsInPeriod` / como `billEstimates` em `calculateDailyBudget`.

- [ ] **Passo 4: verificar** — `npx tsc --noEmit`, `npm run lint`, `npm test`. Em `npm run dev`: o lembrete "Fatura do X" no início e o "Próxima fatura" da tela do cartão **têm que bater ao centavo**. Antes do Passo 1 eles não batiam — é justamente o bug.

- [ ] **Passo 5: commit**

```bash
git commit -m ":sparkles: feat: bill installments and predictions everywhere the invoice is computed"
```

---

## Task 7 — UI do limite

**Arquivos:** `src/components/forms/card-form-dialog.tsx`, `src/app/(app)/cartoes/page.tsx`, `src/app/(app)/cartoes/[id]/page.tsx`.

- [ ] **Passo 1: campo no formulário** — depois do grid fechamento/vencimento (`card-form-dialog.tsx:83-110`), largura cheia. `CardValues` ganha `creditLimit?: number`.

```tsx
<div className="flex flex-col gap-2">
  <Label htmlFor="creditLimit">Limite (opcional)</Label>
  <CurrencyInput id="creditLimit" name="creditLimit" defaultValue={card?.creditLimit} />
</div>
```

Sem `required`: vazio manda `""`, que é o caso do `|| undefined` da Task 5.

- [ ] **Passo 2: barra na lista** (`cartoes/page.tsx`) — dentro da coluna `min-w-0` (linhas 54-64), abaixo de "Próxima fatura", só quando `limitUsage` não for nulo:

```tsx
<Progress
  value={limitUsage.percentUsed}
  className="mt-2 gap-1.5"
  indicatorClassName={limitUsage.percentUsed >= 90 ? "bg-negative" : undefined}
/>
<p className="text-xs text-muted-foreground tabular-nums">
  {formatCurrency(limitUsage.available)} de {formatCurrency(limitUsage.limit)} livres
</p>
```

`Progress` é `"use client"` mas não tem interação e já roda dentro de server component em `app/(app)/page.tsx`. Ele renderiza `children` **acima** da trilha, por isso o texto vem depois. Não adiciona nada focável, então o `<Link>` que envolve o cartão (linha 51) continua clicável — e o `h-full` da linha 48-50 fica **mais** necessário, não menos.

- [ ] **Passo 3: bloco na tela do cartão** (`cartoes/[id]/page.tsx`) — na coluna da esquerda (linhas 80-100), entre "Próxima fatura" e `CardPurchaseFormDialog`: `Card variant="elevated"`, `SectionLabel` "Limite", `formatCurrency(usage.used)` no estilo grande da linha 86 mas **neutro, não `text-negative`** (dinheiro comprometido não é prejuízo), `Progress`, e:

```tsx
<p className="text-sm text-muted-foreground">
  {formatCurrency(usage.available)} disponíveis de {formatCurrency(usage.limit)}
</p>
<p className="text-xs text-muted-foreground">
  Considera as faturas em aberto dos últimos 3 meses e as parcelas futuras.
</p>
{usage.overdueBillCount > 0 && (
  <p className="text-xs text-muted-foreground">
    {usage.overdueBillCount === 1
      ? "1 fatura vencida ainda não marcada como paga."
      : `${usage.overdueBillCount} faturas vencidas ainda não marcadas como pagas.`}
  </p>
)}
```

Quando `creditLimit` é nulo, o bloco todo vira uma linha só: *"Informe o limite no lápis acima para acompanhar quanto já está comprometido."*

O objeto passado para `CardFormDialog` (linhas 61-68) ganha `creditLimit: card.creditLimit ? Number(card.creditLimit) : undefined` — obrigatório, pelo motivo do comentário nas linhas 58-60.

- [ ] **Passo 4: verificar** — `npm run lint`, `npx tsc --noEmit`, e manual em `npm run dev`: cartão com limite mostra a barra; sem limite mostra a dica; marcar uma fatura como paga faz a barra recuar; limite menor que o comprometido mostra 100% em vermelho e `R$ 0,00` disponível — **nunca um número negativo**.

- [ ] **Passo 5: commit**

```bash
git commit -m ":sparkles: feat: show how much of each card's limit is free"
```

---

## Task 8 — UI da projeção, previsões e parcelas

**Arquivos:** criar `src/components/card-bill-projection.tsx`, `src/components/forms/card-bill-estimate-dialog.tsx`; modificar `src/app/(app)/cartoes/[id]/page.tsx`, `src/components/forms/card-purchase-form-dialog.tsx`, `src/components/forms/movement-form-dialog.tsx`, `src/lib/history-item.ts`, `src/components/movement-row.tsx`, `src/lib/format.ts` + `src/lib/format.test.ts`.

- [ ] **Passo 1: `installmentLabel` em `format.ts` (TDD)**

Teste em `src/lib/format.test.ts`:

```ts
describe("installmentLabel", () => {
  it("descreve o parcelamento como 12x de R$ 100,00", () => {
    expect(installmentLabel(1200, 12)).toBe("12x de R$ 100,00");
  });
  it("não descreve parcelamento numa compra à vista", () => {
    expect(installmentLabel(300, 1)).toBeNull();
  });
  it("mostra a primeira parcela quando os centavos não fecham", () => {
    // A sobra vai para a primeira parcela; é ela que o rótulo anuncia.
    expect(installmentLabel(1000, 3)).toBe("3x de R$ 333,34");
  });
});
```

Rodar (`npm test -- format`), ver falhar, implementar:

```ts
/** "12x de R$ 100,00", ou nulo à vista. A parcela mostrada é a PRIMEIRA, que é
 *  onde a sobra dos centavos cai — ver installmentSlices em period.ts. */
export function installmentLabel(total: number, installments: number): string | null {
  if (!Number.isInteger(installments) || installments <= 1) return null;
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / installments);
  const first = base + (cents - base * installments);
  return `${installments}x de ${formatCurrency(first / 100)}`;
}
```

- [ ] **Passo 2: campo Parcelas na compra** (`card-purchase-form-dialog.tsx`, abaixo do grid valor/data das linhas 68-77):

```tsx
<div className="flex flex-col gap-2">
  <Label htmlFor="installments">Parcelas</Label>
  <Input id="installments" name="installments" type="number" inputMode="numeric"
         min="1" max="48" defaultValue={1} />
  <p className="text-xs text-muted-foreground">
    O valor acima é o total da compra; ele é dividido nas próximas faturas.
  </p>
</div>
```

Não controlado, sem state — este arquivo só usa state para o `Select` (linha 37). `type="number"` espelha `closingDay`/`dueDay` e não precisa de input escondido.

- [ ] **Passo 3: o mesmo campo em `movement-form-dialog.tsx`** — é por aqui que a maioria das compras no cartão entra (esse dialog roteia para `createCardPurchase`). Sem o campo, o fluxo principal não consegue criar um parcelado. Renderizar só quando não é edição e o método de pagamento é um cartão, reaproveitando o condicional que já existe no arquivo. Na edição fica de fora, igual ao método de pagamento, que já é congelado ao editar.

- [ ] **Passo 4: "12x de R$ 100,00" no Histórico** — `HistoryItem` e `MovementValues` (`src/lib/history-item.ts`) ganham `installments?: number`; `toMovementValues` repassa; o subtítulo de `HistoryRow` (`movement-row.tsx:81-87`) e a lista da tela do cartão (`cartoes/[id]/page.tsx:118`) acrescentam `· ${installmentLabel(...)}` quando não é nulo.

> **Por que isso é obrigatório e não enfeite:** o Histórico mostra o **total** da compra no mês em que ela foi feita (`historico/page.tsx:34-40,80-90`), e `report-totals.ts:29-31` conta isso como gasto do mês. Está certo — o Histórico é o que aconteceu, e a compra aconteceu uma vez, por R$ 1.200. Mas sem o rótulo, R$ 1.200 se lê como "saiu 1.200 este mês". Não fatiar a linha do Histórico é decisão consciente: linhas fatiadas não têm `id` nem `createdAt`, quebrariam `historyItemKey` (`history-item.ts:41-43`) e forçariam a busca a abrir 48 meses para trás. Aproveite para estender o comentário de `report-totals.ts:21-28` dizendo que a parcela conta no mês da compra.

- [ ] **Passo 5: `card-bill-estimate-dialog.tsx`** — clone de `card-purchase-form-dialog.tsx`. Campos: **Descrição** (`Input`, required), **Valor** (`CurrencyInput`, required) e **Vencimento** — um `Select` do Base UI com input escondido espelhando (padrão das linhas 81-98), com os **6 próximos vencimentos** passados por prop `dueDates: { value: string; label: string }[]` (valores ISO, rótulos `formatDate`).

> **Escolha importante:** um `<input type="date">` livre deixaria escolher um dia que não é vencimento nenhum, e a previsão não casaria com fatura alguma — sumiria em silêncio. O `Select` fechado impede isso por construção.

Gatilho: `<Button variant="ghost" className="gap-2 lg:w-fit">` com `Plus` + "Prever valor na fatura".

- [ ] **Passo 6: `card-bill-projection.tsx` + montar na página** — 6 linhas de `buildCardBills({ from: today, months: 6 })`: `formatDate(bill.dueDate)` + `formatCurrency(bill.amount)`, `text-muted-foreground` quando zero, `Badge` "Paga" com o `paidAmount` quando `bill.paid`, e uma linha `text-xs` "inclui R$ X previstos" quando `estimateAmount > 0`. Abaixo, uma seção **Previsões lançadas**: uma linha por `CardBillEstimate` com descrição, vencimento, valor e `DeleteIconButton` ligado a `deleteCardBillEstimate`.

> As previsões ficam em lista própria, não escondidas dentro das 6 faturas, justamente porque somam (não substituem): é o único jeito de o usuário ver o que ele previu e poder tirar quando a compra real chegar. Previsão **nunca** é removida automaticamente.

- [ ] **Passo 7: verificar** — `npm test`, `npm run lint`, `npx tsc --noEmit`, e manual em `npm run dev`: lançar um 12x pelo fluxo principal, ver o "12x de R$ 100,00" no Histórico, ver as 6 faturas projetadas com R$ 100 em cada, criar e apagar uma previsão e ver a fatura projetada **e** a barra de limite se moverem.

- [ ] **Passo 8: commit**

```bash
git commit -m ":sparkles: feat: project the next six card bills"
```

---

## Ordem de dependência

`T1 → T2 → T3 → T4 → T5 → T6 → {T7, T8}`. T7 e T8 são independentes entre si.

---

## Verificação de ponta a ponta

Depois de tudo, com `npm run dev`:

1. **Comandos:** `npm test` (todos passam, incluindo os 750 de `period.test.ts` **sem edição** nos antigos), `npm run lint`, `npx tsc --noEmit`.
2. **Cartão com limite:** criar "Nubank", fecha 20 / vence 27, limite R$ 5.000. A lista `/cartoes` mostra a barra e "R$ 5.000,00 de R$ 5.000,00 livres".
3. **Parcelado:** lançar "Notebook", R$ 1.200, hoje, **12x**. Na tela do cartão: as 6 faturas projetadas mostram **R$ 100,00 cada** (não R$ 1.200 numa e zero nas outras), e o limite usado vira **R$ 1.200,00** (as 12 parcelas), disponível R$ 3.800,00.
4. **Fatura prevista:** "Prever valor na fatura" → "Anuidade", R$ 300, escolher o vencimento do mês seguinte. Aquela fatura projetada sobe para R$ 400,00 com a linha "inclui R$ 300,00 previstos", e o limite usado vai a R$ 1.500,00. Apagar a previsão desfaz as duas coisas.
5. **Soma no mês do vencimento:** no início (`/`), o lembrete "Fatura do Nubank" tem o **mesmo valor ao centavo** que a fatura correspondente na tela do cartão, e `cardBillTotal` entra no orçamento do período em que aquele vencimento cai.
6. **Pagar libera limite:** marcar a fatura como paga pelo `ConfirmPaymentDialog` do início → o lembrete sai, **o total do período não muda** (invariante das linhas 429-437), e a barra de limite recua pelo valor daquela fatura.
7. **Histórico:** a compra aparece **uma vez**, no mês da compra, por R$ 1.200,00, com "· 12x de R$ 100,00" no subtítulo.
8. **Sem limite:** criar um segundo cartão sem preencher limite → nenhuma barra, e a dica "Informe o limite no lápis acima…". Confirmar em `npx prisma studio` que `creditLimit` é NULL.

---

## Riscos conhecidos, aceitos de propósito

| Risco | Por que fica assim |
|---|---|
| O mês da compra mostra R$ 1.200 de gasto e os 11 meses seguintes escondem R$ 100 reais cada | Não é contagem dupla — Histórico e dashboard respondem perguntas diferentes e nada soma os dois. Fatiar a linha do Histórico é outra feature. Mitigado pelo rótulo "12x de R$ 100,00" |
| Previsão + compra real na mesma fatura somam as duas | É o que "aditivo" significa, e foi a escolha do usuário. Mitigado por listar as previsões separadamente com botão de apagar |
| Dinheiro de previsão não aparece no Histórico | Previsão é palpite, não lançamento. O custo real entra quando a fatura é marcada como paga |
| Fatura vencida há mais de 3 meses e nunca marcada como paga sai do limite sozinha | Alternativa seria comer o limite para sempre por um esquecimento. O `overdueBillCount` avisa enquanto ainda está na janela |
