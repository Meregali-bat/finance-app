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

## Sicoob (21/10)

O extrato de conta corrente do Sicoob (SISBR) também é lido (`src/lib/statement/sicoob.ts`): uma linha "DD/MM HISTÓRICO VALOR C/D" por movimento, com detalhes embaixo; o ano vem do período no cabeçalho. Particularidades:

- **Estornos** ("EST.COMP VISA ELECT", "EST.DÉB.EMPRÉSTIMO", "EST.DÉB. CONV. SEGU") anulam o original de mesmo valor e DOC — o do mesmo dia primeiro, senão o mais próximo — e os dois somem.
- **"PIX.EMIT.OUT IF-MSM"** (mesma titularidade) e Pix recebido do próprio titular são transferências entre contas.
- **"DÉB.PGTO.BOLETO INT" com "Pagamento de cartão de crédito"** é pagamento de fatura.
- **Quem está do outro lado**: o favorecido ("FAV.:") na transferência, a loja na compra no débito, o nome (ou o CNPJ, quando é só ele) no Pix.
- Históricos mudos viram nomes legíveis: "Parcela de empréstimo", "Seguro", "Juros do cheque especial", "IOF".

Conferido com o extrato real: entradas menos saídas, depois dos estornos, batem com a variação do saldo do período.

## Fatura do cartão Sicoob (21/10)

O mesmo "Importar extrato" reconhece a fatura do Sicoobcard (`src/lib/statement/sicoob-card.ts`) e confere com o **cartão escolhido no app** (sugere o que tem "Sicoob" no nome).

- Os lançamentos ficam em duas colunas; cada um é lido a partir da sua data, juntando a faixa logo abaixo dela (a parcela "05/08" e as linhas de dólar e cotação de uma compra internacional).
- O pagamento da fatura anterior (valor negativo) fica de fora; IOF e proteção entram como tarifa.
- Conferência (`card-reconcile.ts`) contra o que o app cobra **nesta fatura**: as parcelas das compras do cartão e as assinaturas. Mesmo valor (um centavo de folga); à vista, até 3 dias de diferença na data; parcelada ou assinatura, sem olhar data.
- **Adicionar uma parcelada cria só o que falta** (decisão do usuário): na parcela 5 de 8, uma compra de 4x da parcela, datada no fechamento desta fatura — a primeira das quatro cai aqui e as faturas antigas, já pagas, não mudam. A descrição leva "(parcelas 5 a 8 de 8)".
- No topo, o total da fatura no banco e no app, e quanto falta.

Conferido com a fatura real: os 59 lançamentos somam o total da fatura.

## Conta PJ do Nubank (22/10)

O extrato da conta PJ do Nubank tem o mesmo layout, com duas diferenças: cada dia fecha com uma linha "Saldo do dia" na coluna do tipo, que não é movimento e é pulada; e o titular vem com o CNPJ do MEI na frente ("62.071.278 FULANA"), que é tirado dos dois lados ao reconhecer a transferência para a conta pessoal da mesma pessoa.

## Banrisul (22/10)

O extrato de conta corrente do Banrisul ("PARA SIMPLES CONFERENCIA") também é lido (`src/lib/statement/banrisul.ts`). É fonte de máquina de escrever, com colunas fixas: o dia só na primeira linha do dia, o histórico ("PIX", "PIX RECEBIDO", "IOF ADICIONAL"), o documento e o valor com "-" no fim quando saiu. O mês e o ano vêm do cabeçalho "MOVIMENTOS OUT/2026"; quem está do outro lado vem da linha "NOME:" de baixo, sem o CNPJ de MEI na frente — então o Pix do próprio MEI do titular conta como transferência entre contas próprias. As linhas de saldo ("SALDO NA DATA", "SALDO ANT EM") não são movimento. O período vai do dia seguinte ao "SALDO ANT EM" até a data de emissão.

## Fora desta versão

Fatura do cartão do Nubank.

## Decisões do construtor

- Leitura por **posição** do texto no PDF (`unpdf`), não pela ordem: o valor fica na coluna da direita, na altura do tipo; os detalhes, numa coluna do meio, que às vezes continua no topo da página seguinte.
- Lógica pura e testada em `src/lib/statement/` (leitura, classificação, conferência); a página só mostra e confirma.
- "Ignorado" é lembrado por uma impressão da linha (data, sentido, valor, descrição e a ordem entre linhas idênticas do dia).
