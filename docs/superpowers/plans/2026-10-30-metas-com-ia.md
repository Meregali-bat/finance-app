# Montar as Metas com a IA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/metas/ia`: a IA categoriza os gastos sem categoria/"Outros", mostra o retrato por fatia e propõe as fatias com dicas.

**Architecture:** Funções puras em `src/lib/spending-insight.ts` (agrupar, retrato, fechar a proposta em 100), testadas. Chamada à IA isolada em `src/lib/spending-ai.ts`. Actions em `src/lib/actions/spending-insight.ts`. Tela client em `src/components/spending-insight.tsx`, página `src/app/(app)/metas/ia/page.tsx`, botão nas duas versões de `/metas`.

**Tech Stack:** Next 16, Prisma 7, zod 4, vitest, `@anthropic-ai/sdk`.

**Spec:** `docs/superpowers/specs/2026-10-30-metas-com-ia-design.md`

## Global Constraints

- Modelo `claude-opus-5-5` numa constante `INSIGHT_MODEL`; recusa clara sem `ANTHROPIC_API_KEY`.
- Períodos: 3 anteriores ao atual (régua das rendas com `createdAt: new Date(0)`, como o Histórico); sem ciclo, 90 dias = 3 períodos de 30.
- Grupos só de gastos sem categoria ou em "Outros" (`normalizeName(nome) === "outros"`), chave `normalizeName(descrição)`, até 300 grupos.
- Proposta: inteiros ≥ 0 somando 100; a diferença vai para a maior fatia de gastar.
- `saveSlices` com `categories: []` e `jars: []`.

## Review Focus

- Sem renda nos períodos → recusa com texto da spec (Task 3).
- Proposta que soma 97 ou 104, ou com fatia negativa → 100 exatos (teste Task 1).
- Item com fatia própria (`slice`) conta nela, não na da categoria (teste Task 1).
- Categoria nova com o mesmo nome de uma existente (outra caixa) → reaproveita (Task 3).
- Gasto emprestado conta só a parte própria (`ownSpending`) (Task 3, via fonte).

---

### Task 1: Funções puras
**Files:** Create `src/lib/spending-insight.ts`, Test `src/lib/spending-insight.test.ts`
**Produces:**
- `interface SpendItem { kind: string; id: string; description: string; amount: number; categoryId: string | null; slice: string | null }`
- `interface CategoryInfo { id: string; name: string; slice: SliceKey }`
- `isOpenItem(item, categoriesById): boolean`
- `groupOpenSpending(items, categoriesById, limit = 300): { groups: SpendGroup[]; smallTotal: number }`, `SpendGroup = { key; description; count; total; items: {kind,id}[] }`, ordenado por total.
- `categoryTotals(items, categoriesById): { name; slice; total; count }[]` (só os não abertos).
- `sliceSnapshot({ items, categoriesById, suggestedSlice: Map<groupKey, SliceKey>, saved: {slice, amount}[], income, periods })` → `{ slices: {key, perPeriod, percent}[]; uncategorized: number; leftover: number; incomePerPeriod: number }` (valores por período).
- `closeProposal(raw: Partial<Record<SliceKey, number>>): SlicePercents`
- [ ] Testes → falhar → implementar → passar → commit.

### Task 2: IA
**Files:** Create `src/lib/spending-ai.ts` — `askSpendingInsight(input): Promise<SpendingAiResult>` com `messages.parse` + `zodOutputFormat`; recusa → `Refusal`.

### Task 3: Actions
**Files:** Create `src/lib/actions/spending-insight.ts` — `analyzeSpending()`, `applyCategoryGroup({ categoryName, slice, items })`, `adoptProposal(percents)`; todas com `refusing`.

### Task 4: Tela
**Files:** Create `src/components/spending-insight.tsx`, `src/app/(app)/metas/ia/page.tsx`; Modify `src/app/(app)/metas/page.tsx` (botão "Montar com a IA" nos dois estados). Guarda a análise em `localStorage` (`spending-insight:v1`).
- [ ] `tsc`, `eslint`, `vitest`, `next build` passam; commit; merge no main a pedido.
