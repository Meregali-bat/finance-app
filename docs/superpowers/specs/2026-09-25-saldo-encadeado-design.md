# Saldo encadeado entre períodos

**Objetivo:** todo período leva em conta o anterior. A sobra, ou o que faltou, de um período é o saldo com que o seguinte abre — na Início, na Previsão, na simulação "Posso comprar isso?" e no fechamento.

---

## Context

Até aqui cada período era calculado sozinho: `renda − fixos − faturas − lançamentos` daquele intervalo. Consequências:

- Na Previsão, um mês no vermelho não pesava no seguinte, e uma sobra também não passava adiante.
- O fechamento só carregava sobra positiva, e só se o usuário escolhesse "manter" — ele criava um lançamento de entrada "Saldo do período anterior". Déficit era descartado em silêncio.
- Só o período imediatamente anterior era fechado; pular dois ciclos perdia o mais antigo.
- Conta vencida e não paga sumia dos lembretes quando o período virava.
- A simulação de compra julgava cada ciclo isoladamente.

---

## O modelo

```
abertura(N)   = fechamento(N − 1)
fechamento(N) = abertura(N) + resultado(N)
resultado(N)  = renda confirmada − despesas fixas − faturas − lançamentos − depósitos em caixinha
```

A abertura do período **corrente** tem duas fontes (`src/lib/carry-over.ts`):

| Fonte | Quando | Como |
|---|---|---|
| `account` | O usuário informou o saldo em conta | `fechamento(0) = saldo em conta − contas do período sem pagamento − contas do período anterior sem pagamento − lançamentos com data futura + recebimentos confirmados com data futura`. A abertura exibida é `fechamento − resultado`. |
| `history` | Sem saldo informado | Encadeia os períodos anteriores a partir do primeiro que o app acompanhou (o cadastro da renda mais antiga), abrindo do zero, até `MAX_CARRY_PERIODS` (24) ciclos para trás. |

O saldo em conta manda quando existe porque é o dinheiro real: já carrega todos os meses, inclusive o que havia antes do app.

A Previsão parte dessa abertura e encadeia para frente. O período 0 da Previsão e o "Saldo do período" da Início são o mesmo número — há teste afirmando isso nos dois modos.

## Regras unificadas

- **Renda não confirmada cujo dia já passou não conta**, na Início e na Previsão. Na Previsão ela aparece riscada, "aguardando confirmação, fora da conta". Renda futura continua projetada.
- **O que está desligado** é decidido pelos módulos puros, igual em toda tela: renda inativa não marca período nem é projetada, mas o que ela pagou conta; despesa encerrada para no `endedAt`; cartão desativado continua devendo as parcelas. `loadBudgetInputs` carrega tudo.
- **Depósito em caixinha** sai do dinheiro disponível no período em que foi feito — coerente com o saldo em conta, que já o tratava como saída.
- **Contas vencidas do período anterior** sem pagamento continuam nos lembretes ("venceu em"). Um período para trás, não a história inteira.
- **Linhas antigas do fechamento** (`fromPeriodClose`) ficam fora de tudo, inclusive do Histórico, onde eram lidas como renda nova.

## Fechamento

Não carrega mais nada — isso é automático. Quando o período anterior deixou sobra, pergunta uma vez se ela vai para uma caixinha; a resposta vira um depósito comum. Déficit não abre diálogo, e continua pesando no período atual. O valor vem do servidor, não do cliente.

## Simulação "Posso comprar isso?"

A régua da sobra passa a olhar o saldo encadeado, do período da primeira parcela até um mês depois da última: uma parcela pesa no ciclo em que cai e em todos os seguintes. A folga por parcela divide pelo número de parcelas **acumuladas** até o ciclo. O comprometimento usa a renda esperada (com a que aguarda confirmação), já que mede o peso das contas sobre o que se ganha.

## Fora de escopo

Os demais itens da auditoria de 25/09: exclusão definitiva de renda/cartão/caixinha, Histórico por competência vs. caixa, previsões manuais de fatura fora do Histórico, datas gravadas como instante.
