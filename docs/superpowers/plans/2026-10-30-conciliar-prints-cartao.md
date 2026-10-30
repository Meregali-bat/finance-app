# Conciliar o cartão pelas prints — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na tela do cartão, ler prints da tela "Lançamentos" do banco com a IA e conciliar com as compras do cartão no app (só no banco / só no app / ligar, corrigindo o valor).

**Architecture:** A lógica pura (normalizar o que a IA leu, deduplicar, filtrar status, conciliar, impressões) fica em `src/lib/statement/card-screenshots.ts`, testada. A chamada à API da Anthropic fica isolada em `src/lib/statement/read-screenshots.ts`. As server actions em `src/lib/actions/card-screenshots.ts` juntam as duas coisas com o Prisma. A UI é um client component na tela do cartão.

**Tech Stack:** Next 16 (server actions), Prisma 7, zod 4, vitest, `@anthropic-ai/sdk` (novo).

**Spec:** `docs/superpowers/specs/2026-10-30-conciliar-prints-cartao-design.md`

## Global Constraints

- O modelo é `claude-opus-5-5`, numa constante exportada `SCREENSHOT_MODEL`. A chave vem de `ANTHROPIC_API_KEY`.
- O limite de corpo de server action é `4mb` (`next.config.ts`). O cliente reduz cada imagem para JPEG com o lado maior ≤ 1568px.
- Contam como compra: status `processado` e `pendente`. Ficam de fora: `negado`, `cancelado`, `desconhecido`, e linhas cujo `kind` não é `compra`.
- Casamento: mesmo valor (≤ 1 centavo) com o total **ou** com a parcela da compra do app; data com até 3 dias de diferença; cada compra do app confere uma linha só.
- Ligar: à vista, `amount = linha`; parcelada, `amount = round2(linha × installments)`.
- Impressões: linha do banco `shot|cardId|YYYY-MM-DD|HH:MM|centavos|nome normalizado`; manter compra `keep|purchaseId`. Ambas em `StatementIgnore`.
- Textos da UI em pt-BR, no tom de `statement-import.tsx`.

## Review Focus

- Prints sobrepostas com a mesma linha → uma linha só (teste em Task 1).
- Mês da print depois do mês atual (dezembro lido em janeiro) → ano anterior (teste em Task 1).
- Compra do app logo fora do período, mas a ≤ 3 dias de uma linha → casa, e não aparece como "só no app" fora do período (teste em Task 1).
- Todas as linhas negadas/canceladas → erro claro "nenhuma compra", não conciliação vazia (Task 3, checagem manual).
- Muitas prints grandes → o cliente reduz antes de enviar e não estoura os 4mb (Task 4, checagem manual).

---

### Task 1: Lógica pura

**Files:**
- Create: `src/lib/statement/card-screenshots.ts`
- Test: `src/lib/statement/card-screenshots.test.ts`

**Interfaces — Produces:**
- `type ShotStatus = "processado" | "pendente" | "negado" | "cancelado" | "desconhecido"`
- `interface RawShotLine { description: string; day: number; month: number; time: string; amount: number; status: ShotStatus; kind: "compra" | "outro" }`
- `interface ShotLine { fingerprint: string; date: string /* YYYY-MM-DD */; time: string; description: string; amount: number }`
- `prepareShotLines(raw: RawShotLine[], cardId: string, today: Date): { lines: ShotLine[]; skipped: number }`. Deduplica por (descrição normalizada, dia, mês, hora, centavos) e ordena da mais recente para a mais antiga. `skipped` conta as linhas fora (depois de deduplicar).
- `interface AppPurchase { id: string; description: string; date: string; amount: number; installments: number }`
- `reconcileShots(lines: ShotLine[], app: AppPurchase[]): { period: { start: string; end: string }; matched: { line: ShotLine; purchase: AppPurchase }[]; onlyBank: ShotLine[]; onlyApp: AppPurchase[]; bankTotal: number; appTotal: number }`. Os totais contam todas as linhas e todas as compras do app **dentro do período**. `onlyApp` só traz compras dentro do período.
- `linkedAmount(lineAmount: number, installments: number): number`
- `keepFingerprint(purchaseId: string): string`

- [ ] Testes: dedup; status/kind filtrados e contados; ano voltando quando o mês > mês de hoje; casa por parcela (300 em 3x × linha 100); casa com 3 dias, não com 4; compra fora do período que casa não entra em `onlyApp` e a que não casa também não; `linkedAmount(100, 3) === 300`, `linkedAmount(43.25, 1) === 43.25`.
- [ ] Rodar `npx vitest run src/lib/statement/card-screenshots.test.ts` e ver falhar; implementar; ver passar.
- [ ] Commit.

### Task 2: Leitura pela IA

**Files:**
- Modify: `package.json` (`npm i @anthropic-ai/sdk`)
- Create: `src/lib/statement/read-screenshots.ts`

**Interfaces — Produces:** `readCardScreenshots(images: { mediaType: "image/jpeg" | "image/png" | "image/webp"; data: string /* base64 */ }[]): Promise<RawShotLine[]>`. Chama `client.messages.parse` com `output_config.format: zodOutputFormat(schema)`, todas as imagens numa mensagem e o prompt descrevendo a tela (valor riscado + selo = status; "Pendente"; sem selo = processado; R$ 0,00 "Desconhecido"; mês em inglês ou pt; hora HH:MM; pagamentos/estornos/créditos = `outro`). Se `stop_reason === "refusal"` ou `parsed_output` for nulo, lança `Refusal("Não consegui ler as prints. Tente de novo.")`.

- [ ] Implementar; `npx tsc --noEmit` passa.
- [ ] Commit.

### Task 3: Server actions

**Files:**
- Create: `src/lib/actions/card-screenshots.ts`

**Interfaces — Produces:**
- `analyzeCardScreenshots(cardId: string, formData: FormData): Promise<ShotAnalysis | Refused>` com `ShotAnalysis = { period; bankTotal; appTotal; matched: number; skipped: number; ignoredBefore: number; onlyBank: (ShotLine & { categoryId: string | null })[]; onlyApp: AppPurchase[] }`. Lê os arquivos `images` do FormData (máx. 20). Sem `ANTHROPIC_API_KEY` → recusa "A leitura de prints não está configurada (falta ANTHROPIC_API_KEY)." Sem compras lidas → recusa "Não achei compras nessas prints." Busca as compras do cartão em [start − 3 dias, end + 4 dias). Tira de `onlyBank` as já ignoradas e de `onlyApp` as já mantidas.
- `addShotPurchase(cardId, line: { fingerprint, date, description, amount, categoryId })`: cria a `CardPurchase` à vista (descrição em formato de título, como `purchaseFromLine`).
- `ignoreShotLine(fingerprint)` e `keepAppPurchase(purchaseId)`: gravam em `StatementIgnore`.
- `linkShot(cardId, purchaseId, lineAmount)`: atualiza só o `amount` para `linkedAmount(...)`. Se existir um `Loan` ligado com o mesmo valor antigo, acompanha.
- Excluir usa `deleteCardPurchase` como está.
- Todas usam `refusing` e revalidam como `card.ts`.

- [ ] Implementar; `npx tsc --noEmit` passa.
- [ ] Commit.

### Task 4: Tela

**Files:**
- Create: `src/components/card-screenshot-check.tsx`
- Modify: `src/app/(app)/cartoes/[id]/page.tsx` (abaixo dos botões de compra)

Um `<details>`/card "Conferir com prints do banco" com input `accept="image/*" multiple`. Ao escolher, reduz cada imagem num canvas, chama `analyzeCardScreenshots` e mostra:
- O resumo: período, os dois totais, a diferença, quantas batem e quantas foram ignoradas.
- "Só no banco": Adicionar/Ignorar.
- "Só no app": Excluir (com `ConfirmDialog`), Manter e Ligar, que abre a lista de "Só no banco" para escolher a linha e mostra o novo valor.

Cada ação chama a action e tira o item do estado local.

- [ ] Implementar; `npx tsc --noEmit`, `npm run lint` e `npm test` passam.
- [ ] Abrir no navegador com dados de teste, se for possível.
- [ ] Commit e push.
