# Importar extrato do Nubank (21/10)

## Por quê

Tudo no app é lançado à mão (ou pelo atalho da Carteira), e o que escapa — um Pix, um débito, um boleto — só aparece quando o saldo não bate. O extrato em PDF que o Nubank exporta tem tudo; importar e conferir mostra o que falta, sem a pessoa caçar linha por linha.

## O que a pessoa faz

Em **Histórico → Importar extrato**, escolhe o PDF. O app lê, confere com o que já está lançado e mostra só as **diferenças**, cada uma com **Adicionar** ou **Ignorar**. Nada é gravado antes de confirmar. O que foi ignorado fica lembrado e não volta numa importação que cubra os mesmos dias.

## Regras (decididas com o usuário)

- O "saldo em conta" do app é **Nubank + Sicoob somados**. Por isso, transferência entre as próprias contas (o titular dos dois lados) não muda nada: é ignorada sozinha, só contada.
- **Aplicação e resgate de RDB**: investimento, ignorados (o rendimento também).
- **Pagamento de fatura**: nunca vira gasto (as compras do cartão já contam). Sem pagamento de fatura marcado no app com o mesmo valor e data próxima, aparece um aviso para conferir em Cartões.
- **Salário e demais entradas**: conferidos com as rendas confirmadas e as receitas lançadas.
- **O resto** (Pix para lojas e pessoas, débito, boleto, Pix recebido): conferido com o que saiu ou entrou na conta pelo app — lançamentos, pagamentos de conta fixa e de fatura, caixinhas, rendas — pelo **mesmo valor com até 2 dias de diferença** (rendas: até 3). Cada registro do app confere uma linha só.
- O adicionado vira lançamento comum (gasto ou receita), com descrição limpa ("Pix para Posto Roda Mais", "Spotify") e a categoria do último lançamento com a mesma descrição. Com data anterior à última correção do saldo, não mexe no saldo — a regra de `alreadyInReading` já cuida disso.

## Fora desta versão

Extrato do Sicoob (outro formato). Extrato de cartão de crédito.

## Decisões do construtor

- Leitura por **posição** do texto no PDF (`unpdf`), não pela ordem: o valor fica na coluna da direita, na altura do tipo; os detalhes, numa coluna do meio, que às vezes continua no topo da página seguinte.
- Lógica pura e testada em `src/lib/statement/` (leitura, classificação, conferência); a página só mostra e confirma.
- "Ignorado" é lembrado por uma impressão da linha (data, sentido, valor, descrição e a ordem entre linhas idênticas do dia).
