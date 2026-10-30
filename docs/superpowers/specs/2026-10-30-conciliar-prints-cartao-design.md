# Conciliar o cartão pelas prints do app do banco (30/10)

## Por quê

Com a fatura **ainda aberta** não existe PDF. Quando a pessoa nota que o total do cartão no app não bate com o do app do banco, a única fonte é a tela "Lançamentos" do app do Sicoob. Hoje ela compara linha por linha de cabeça. A ideia é tirar prints dessa tela, mandar para o app e ver lado a lado o que tem em cada um, corrigindo ali mesmo.

É uma conferência **ocasional**, feita só quando aparece uma divergência, e não uma rotina.

## O que a pessoa faz

1. Na **tela do cartão** (`/cartoes/[id]`), toca em "Conferir com prints" e escolhe várias imagens de uma vez, como as prints que se sobrepõem ao rolar a lista.
2. O app lê as imagens com a IA e mostra a **conciliação** do cartão: o que bate, o que está só no banco e o que está só no app.
3. A pessoa resolve as diferenças. Nada é gravado antes de ela tocar num botão.

## Leitura das prints

- A leitura é feita pela API da Anthropic, com o modelo **`claude-opus-5-5`** (escolha minha; o usuário criou a chave e não escolheu modelo). A chave fica na variável `ANTHROPIC_API_KEY` da Vercel. O modelo fica numa constante, para trocar por Sonnet ou Haiku se o custo pesar. Cada conferência com cerca de 9 prints custa uns R$ 0,90.
- Todas as imagens vão numa chamada só, e a resposta volta como **saída estruturada** (`output_config.format`): uma lista de lançamentos com descrição, dia, mês, hora, valor, status e cartão (Físico/Virtual e final).
- **Status:** **Pendente** e sem selo (processado) contam como compra. **Negado**, **Cancelado** e **Desconhecido** (R$ 0,00, valor riscado) ficam de fora. Esses ficam de fora só da conciliação: a tela mostra quantas linhas foram ignoradas, como "6 negadas ou canceladas ignoradas".
- **Prints sobrepostas:** linhas iguais em descrição, dia, hora e valor viram uma só. Duas compras de verdade com o mesmo nome, valor e minuto também colapsariam, mas isso é raro e aceito.
- **Ano:** a tela mostra "29 OCT" sem o ano. O ano é o atual. Um mês depois do mês de hoje volta um ano, para cobrir a conferência de dezembro feita em janeiro.
- Os finais Virtual (8432, 6402, 3972...) e Físico entram todos no mesmo cartão do app. O cartão é o da tela onde a importação foi aberta.
- Se a IA não achar lançamentos ou a chamada falhar, a tela mostra um erro claro, e não uma conciliação vazia.

## Período conferido

As prints cobrem só uma janela de dias. A conciliação usa o intervalo **do dia mais antigo ao mais recente** entre as linhas lidas, e só olha as compras do app (`CardPurchase` desse cartão) com **data de compra** dentro dele. Assinaturas (`FixedExpense` no cartão) e previsões (`CardBillEstimate`) ficam de fora: não têm data de compra e não aparecem nessa tela do banco.

## A conciliação

Mesma regra de casamento do PDF (`card-reconcile.ts`): **mesmo valor (um centavo de folga) e até 3 dias de diferença na data**, e cada compra do app confere uma linha só. O valor comparado é o da compra no app (`amount`, o total) contra o valor da linha. Ver a dúvida sobre parceladas em "Fica para o construtor".

A tela mostra, nesta ordem:

- **Topo:** o total das prints que contam, ao lado do total das compras do app no mesmo período, e a diferença.
- **Só no banco:** linhas das prints sem compra no app. Cada uma tem:
  - **Adicionar**, que cria uma `CardPurchase` à vista com a categoria do histórico (`categoryFromHistory`) e a descrição em formato de título, como o PDF faz.
  - **Ignorar**, que fica lembrado (`StatementIgnore`) e não volta em outra conferência.
- **Só no app:** compras do app no período sem linha nas prints. Cada uma tem:
  - **Excluir**, para duplicada ou compra que foi negada.
  - **Manter**, para quando está certa. Fica lembrada e não volta nas próximas conferências.
  - **Ligar a uma do banco:** a pessoa escolhe uma linha de "Só no banco". As duas saem das listas e **o valor da compra no app passa a ser o do banco** (decisão do usuário). A descrição e a data do app não mudam.
- **Batem:** contagem recolhida ("32 conferidas"), que abre a lista se a pessoa tocar.

Depois de cada ação a tela se atualiza sem nova leitura das imagens, porque o resultado da IA fica no estado do cliente.

## Não é

- Não substitui a importação da fatura em PDF, que continua em Histórico → Importar extrato.
- Não grava as imagens.
- Não lê outros bancos nesta versão. O prompt é escrito para a tela do Sicoob, mas nada impede que funcione com telas parecidas.

## Decisões minhas (depois da revisão)

- **Totais do topo:** contam tudo o que é compra dos dois lados no período, incluindo o que foi "Ignorado" ou "Mantido". Assim a diferença mostra a divergência real, e não só o que falta resolver.
- **Linhas que não são compra** (pagamento de fatura, estorno, crédito): a IA marca o tipo de cada linha, e só compras entram na conciliação. As outras são contadas à parte, como as negadas.
- **Excluir e Ligar** reaproveitam `deleteCardPurchase` / `updateCardPurchase` de `src/lib/actions/card.ts`, com o mesmo comportamento da tela do cartão (cascata do schema). Excluir pede confirmação.

## Fica para o construtor

- **Parceladas:** não sei se a tela do banco mostra o total ou a parcela de uma compra parcelada (nas prints não aparece nenhuma). Escolha minha: o casamento aceita o valor da linha igual ao total **ou** à parcela da compra no app. A IA também extrai um "x/y" se aparecer.
- **Onde lembrar o "Manter":** reaproveitar `StatementIgnore` com uma impressão do tipo `keep|<purchaseId>` evita migração. Fica a critério do construtor.
- A impressão das linhas do banco para "Ignorar" é `shot|cardId|data|hora|centavos|nome normalizado`.
- O formato do envio das imagens (base64 numa server action, limite de tamanho, redução de resolução no cliente se precisar), o prompt e o layout da tela seguem os padrões do app (`statement-import.tsx`, `homeCard`, `ChoiceSelect`).
- A lógica pura (deduplicar, filtrar status, período, conciliar) fica em `src/lib/statement/` com testes, como as outras importações. A chamada à IA fica isolada para os testes não dependerem dela.
