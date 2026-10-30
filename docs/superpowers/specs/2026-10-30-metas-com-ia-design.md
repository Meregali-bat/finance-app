# Montar as Metas com a IA (30/10)

## Por quê

As Metas (as seis fatias da renda, `src/lib/slices.ts`) só servem com porcentagens que façam sentido, e o usuário não consegue escolhê-las: não sabe quanto gasta hoje em cada coisa. Muitos gastos estão sem categoria ou em "Outros", então nem o app sabe. A ideia é a IA olhar os gastos reais, categorizar o que falta, mostrar o retrato de hoje e propor as fatias com dicas concretas de onde cortar.

## O que a pessoa faz

1. Em **Metas**, toca em **Montar com a IA**. O botão aparece tanto com as fatias ainda não configuradas quanto já configuradas. Abre `/metas/ia`.
2. Toca em **Analisar meus gastos**. Um aviso curto diz que os gastos vão para a IA da Anthropic. A análise leva alguns segundos.
3. Vê, nesta ordem:
   - **Categorias:** os grupos de gastos que a IA categorizou, como "Restaurantes (nova) · 12 gastos · R$ 640: AFriesRestaurante, Frutos da Terra...". Cada grupo tem **Aplicar** e tem também **Aplicar todas**. A categoria nova só é criada ao aplicar e já nasce com a fatia sugerida.
   - **Hoje:** quanto da renda foi, em média por período, para cada fatia. O cálculo considera as categorias sugeridas, mesmo as ainda não aplicadas, com uma nota dizendo isso.
   - **Proposta:** a porcentagem de cada fatia, somando 100, com uma frase do porquê.
   - **Dicas:** até 5, cada uma com valores reais, como "Restaurantes somaram R$ 820 por período; R$ 500 libera R$ 320 para Liberdade financeira".
   - **Usar esta proposta:** grava as porcentagens pelo `saveSlices` e leva para `/metas`. Para ajustar à mão, o caminho é o de sempre, `/metas/ajustar`.
4. A análise fica guardada no aparelho (`localStorage`), como a conferência por prints, e sobrevive a sair e voltar. **Analisar de novo** substitui a anterior.

Nada é gravado sem um toque em Aplicar ou Usar.

## Dados que vão para a IA

- **Período:** os 3 períodos de pagamento **anteriores** ao atual, encadeados com `getPreviousPeriodBounds`. O período atual fica de fora porque está pela metade. Sem renda cadastrada, ou sem histórico nos ciclos, usa os últimos 90 dias.
- **Gastos:** `loadHistoryItems` no intervalo, filtrado por `countsAsSpending`, com o valor de `ownSpending` (sem a parte emprestada). Mesma fonte do Histórico e das Metas.
- **Agrupamento:** os gastos são agrupados pela descrição normalizada (`normalizeName`). Cada grupo leva descrição, quantidade, total, categoria atual e fatia atual. São no máximo 300 grupos, os de maior total; o resto é somado como "outros pequenos". Assim o pedido fica pequeno e não manda cada lançamento.
- **Também vão:** as categorias da pessoa com a fatia de cada uma (`sliceOfCategory`), a renda do período (`budget.incomeTotal`, como as Metas usam), as fatias atuais se existirem, e as seis fatias com nome, se são de guardar e a dica de cada uma.

## O que a IA devolve

Saída estruturada (`output_config.format`), modelo `claude-opus-5-5` numa constante, como em `read-screenshots.ts`:

- `newCategories`: nome e fatia de cada categoria nova.
- `assignments`: para cada grupo **sem categoria ou em "Outros"**, o nome de uma categoria existente ou nova. Grupos com categoria específica não mudam.
- `proposal`: porcentagem inteira por fatia e uma frase do porquê.
- `tips`: até 5, cada uma com título, detalhe e economia por período em reais.
- `summary`: duas ou três frases sobre o retrato.

O servidor valida o que voltou:
- Categorias nomeadas que não existem e não estão em `newCategories` → o grupo fica sem sugestão.
- A proposta precisa somar 100. Se não somar, a diferença vai para a maior fatia de gastar.
- O "Hoje" é calculado no servidor (função pura, testada), e não pela IA.

## Aplicar

- **Aplicar um grupo:** cria a categoria nova se preciso, com nome único por usuário, sem diferença de maiúsculas e reaproveitando a que já existir com esse nome. Depois dá essa categoria aos itens do grupo que são `transaction` ou `card`. Itens de outros tipos (conta fixa paga, assinatura no cartão) têm a categoria editada em Fixos, então são contados mas não mudam. A tela avisa quantos ficaram de fora.
- **Usar esta proposta:** `saveSlices` com as porcentagens e as categorias com a fatia atual de cada uma, sem mudar as caixinhas.

## Decisões minhas (depois da revisão)

- **A renda** é a média do recebido (`countsAsReceived`) nos períodos analisados. No recuo de 90 dias, são 3 "períodos" de 30 dias. Sem renda nenhuma, a análise recusa com "Confirme uma renda para a IA comparar seus gastos com ela".
- **"Hoje" das fatias de guardar** vem do guardado nas caixinhas no intervalo, por fatia da caixinha, como `loadSlicesOverview` faz. O que sobra (renda − gasto − guardado) aparece numa linha "Sobrou sem destino". Se faltar dinheiro, a linha mostra a falta.
- **Os grupos** são formados só pelos gastos sem categoria ou em "Outros". Gastos com categoria específica vão para a IA somados por categoria, só como contexto. Assim Aplicar nunca toca num gasto já categorizado.
- **"Hoje" segue as regras das Metas:** a fatia escolhida no próprio item vale mais que a da categoria. Os grupos com sugestão contam na fatia da categoria sugerida. O que fica sem fatia aparece numa linha "Sem categoria".
- **Categoria nova** grava a fatia sugerida em `Category.slice` ao ser criada. "Usar esta proposta" grava só as porcentagens (`saveSlices` com `categories: []` e `jars: []`), sem transformar em escolha o palpite de fatia das categorias existentes.

## Não é

- Não muda gastos que já têm categoria específica.
- Não roda sozinha nem manda aviso. Só roda quando a pessoa toca em Analisar.
- Não é um chat.

## Fica para o construtor

- O texto do prompt, o layout de `/metas/ia` (no estilo das telas de Metas), o formato guardado no aparelho e o limite exato de grupos.
- Onde ficam as funções puras (agrupar, retrato, ajustar a proposta para 100) e os testes delas. A chamada à IA fica isolada, como em `read-screenshots.ts`.
- O custo esperado é de R$ 0,50 a R$ 1,00 por análise.
