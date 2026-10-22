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

Revisão de 22/10:

- **Horizonte:** a régua do saldo olha pelo menos os 12 ciclos da Previsão, não só até um mês depois da última parcela. Uma conta grande meses depois (IPVA, IPTU) é onde a sobra que a compra levou vai faltar.
- **Fatias de guardar:** com as fatias ligadas, o saldo de cada ciclo precisa ficar acima do que ainda vai para as caixinhas, acumulado: no corrente, o que falta guardar exatamente como a Início calcula (`todayBudget().savings.remaining`); em cada ciclo seguinte, mais a parte de guardar da renda esperada dele. Abaixo disso o veredito é "Melhor não" com motivo próprio (`savingsReserve`): a parcela sairia do dinheiro de guardar, que a Início já tira do número do dia. A sugestão do que caberia desconta a mesma reserva.

## Livre para gastar e reserva (revisão de 25/09)

O saldo acumulado (`balance`) supõe que nada além do comprometido é gasto, e por isso a sobra de um mês reaparecia em todos os seguintes — o "por dia" de março oferecia o mesmo dinheiro que setembro já tinha oferecido. O número que se gasta agora é outro:

```
M(N)            = menor balance de N até o fim do horizonte (12 ciclos, no mínimo)
livre(N)        = max(0, M(N) − gasto acumulado até N − 1)
fim(N)          = balance(N) − gasto acumulado até N   (a herança do ciclo seguinte)
por dia(N)      = livre(N) / dias, ou fim(N) / dias quando fim(N) < 0
```

O livre nunca é negativo. Um ciclo que não se paga fecha negativo, e esse negativo é herdado pelo seguinte, que só tem livre depois de cobri-lo. (A primeira versão permitia livre negativo no ciclo corrente, o que concentrava nele o buraco de todo o horizonte e fazia outubro abrir limpo depois de um setembro no vermelho.)

Com meses que se pagam, o livre de um ciclo futuro é só o resultado dele. Quando um ciclo à frente não se paga, os anteriores guardam a diferença — e a Início, que usa o livre do ciclo corrente, já reserva hoje para o IPVA de novembro. Somado ciclo a ciclo, o livre nunca passa do dinheiro que existe.

## Depois de um ajuste de saldo

O saldo informado já contém a sobra ou a falta de todos os meses anteriores; somá-las de novo contaria duas vezes, e o cálculo não soma — com ajuste, a corrente dos períodos é ignorada. Por isso:

- A Início diz "a partir do seu saldo em conta" em vez de "inclui R$ X dos períodos anteriores".
- O fechamento oferece guardar só o **resultado do próprio período anterior**, limitado à herança — nunca o saldo da conta.
- **Nada entra duas vezes.** Registrado antes do ajuste, o movimento já está no saldo informado. Registrado depois, mas com data anterior ao dia do ajuste — o salário confirmado atrasado, a compra lançada atrasada, a fatura paga antes e marcada depois —, também: o banco já o mostrava. No próprio dia do ajuste, sem hora para separar, a dúvida vai para o lado seguro: o que tira dinheiro conta, o que põe fica de fora.
- "Marcar como paga" pergunta **quando** foi pago ("Pago em", padrão hoje). Antes a data gravada era a do clique, e não havia como saber se o pagamento já estava no extrato. A compra criada ao pagar uma despesa fixa no cartão usa o mesmo dia, em meia-noite UTC.

Isso revoga o "lançamento esquecido entra" do spec do saldo em conta (2026-09-11): decisão do usuário em 25/09 — se o movimento já tinha acontecido quando o saldo foi informado, ele faz parte do ajuste.

## Demais itens da auditoria (25/09)

- **Contas vencidas:** Início, Previsão e tela do cartão olham o mesmo prazo, `LIMIT_LOOKBACK_MONTHS` (3 meses). Intervalos longos são somados mês a mês.
- **Assinaturas no cartão:** as telas de cartão carregam todas as despesas com as datas delas, em vez de filtrar por `active`.
- **Pausa:** cada pausa é uma linha em `FixedExpensePause`. Reativar fecha o intervalo sem apagá-lo, e os meses pausados continuam sem cobrança. `FixedExpense.endedAt` fica só para o encerramento definitivo. A migration converte as pausas antigas.
- **Apagar renda, cartão ou caixinha** só marca `deletedAt`; recebimentos, compras, pagamentos e depósitos continuam valendo. Um cartão com assinatura ativa não pode ser apagado. Uma caixinha precisa estar vazia, e **Resgatar** (um depósito negativo) devolve o dinheiro ao disponível.
- **Histórico:** o cartão entra pelas faturas que vencem no período, aberta cada uma em parcelas, assinaturas, previsões manuais e a diferença entre o previsto e o pago (`src/lib/history-bills.ts`). As linhas de uma fatura somam o que ela cobrou. Caixinhas aparecem e saem do saldo do mês ("Guardado").
- **Fuso:** `src/instrumentation.ts` põe o processo em `APP_TIME_ZONE` (padrão `America/Sao_Paulo`); o "hoje" do servidor deixa de virar às 21h.
- **Troca de renda:** a corrente começa na renda mais antiga, inclusive desligada ou apagada.

Fica como está, de propósito: os depósitos antigos do fechamento (`fromPeriodClose`) seguem fora do saldo em conta. As leituras de saldo que o usuário fez depois deles já os contaram assim, e mudar a regra agora falsificaria essas leituras.

## Adiar despesa fixa (08/10)

Ao lado de "Marcar como paga", o lembrete de despesa fixa avulsa tem **Adiar**: a ocorrência sai dos lembretes e do orçamento do mês, e o valor informado (que pode ter juros ou multa) vai para:

- **o mês seguinte**, somado à próxima ocorrência num lembrete só ("inclui R$ X adiados"); ou
- **depois da última parcela**, como uma cobrança extra — como pular uma parcela de financiamento. Só para despesas com **Parcelas restantes** (campo novo, opcional; vazio = não termina). Adiar duas vezes para o fim enfileira duas cobranças.

Cada adiamento é uma linha em `ExpenseDeferral`, com o alvo calculado e gravado na hora (`deferralTargetDate`). A regra de "quanto vence nesta data" mora em `expenseCharges`, usada pelo orçamento e pela previsão. Adiar de novo uma ocorrência que já acumulava leva tudo junto. Os adiamentos aparecem em Fixos, onde se desfazem. As parcelas contam meses de calendário a partir do primeiro vencimento depois do cadastro; uma pausa não estende o fim.

## Empréstimos (18/10)

Uma despesa (lançamento ou compra no cartão) pode ser marcada como **emprestada para alguém**. Decisões do usuário:

- **Conta como saída na hora.** A despesa entra no orçamento e no saldo como qualquer outra; o empréstimo (`Loan`, ligado à despesa) só lembra quem deve e quanto. Apagar a despesa apaga o empréstimo.
- **A pessoa deve o total** (ou menos, numa conta dividida), com a opção de combinar **parcelas mensais** a partir de uma data. Sem data, fica só o lembrete do total.
- **Só o que te devem**, não o que você deve.

O que volta é uma **receita comum** ("Recebido de João", `Transaction` negativa) com um `LoanRepayment` dizendo de quem veio — por isso entra no saldo, no orçamento do dia em que chegou e no Histórico sem regra nova. Abate os empréstimos da pessoa do mais antigo para o mais novo (`src/lib/loans.ts`). Apagar a receita desfaz o recebimento.

A Início mostra **A receber**: uma linha por pessoa com o total em aberto e a próxima parcela (ou "desde"), e o "Recebi". A Previsão não conta com o que te devem. No Histórico, a despesa emprestada diz "emprestado a João" e vai para o balde **Emprestado** em "Por categoria".

## Cadastro e primeiro uso (20/10)

Cadastro aberto na tela de login ("Criar conta": email e senha, mínimo 8 caracteres), sem envio de email — recuperar senha é pedir a quem administra. Email comparado sem diferença de maiúsculas, no cadastro e no login. Conta nova nasce com as categorias padrão (`src/lib/default-categories.ts`).

Até terminar o primeiro uso (`User.onboardedAt` nulo), o app leva para `/comecar`: renda (obrigatória) → saldo em conta → contas fixas → cartão (os três opcionais), cada passo gravando na hora com as actions de sempre, e o resultado mostra o "quanto posso gastar hoje" calculado por `todayBudget` — a mesma função da Início. Quem já existia ficou marcado como concluído na migration.

## Lançamento automático pelo iPhone (21/10)

O iPhone não deixa ler as notificações de outros apps, então o caminho é a automação **Carteira** do app Atalhos ("Transação" no iOS 17), que dispara a cada pagamento por aproximação pela Carteira. Ela manda `{ valor, loja, cartao }` em JSON para `POST /api/atalho`, com a chave pessoal no cabeçalho `Authorization` (com ou sem "Bearer ").

- **Chave:** gerada em Cartões, mostrada uma única vez; o banco guarda só o SHA-256 (`User.shortcutTokenHash`). Gerar outra invalida a anterior; dá para desligar.
- **Cartão:** casado pelo nome — o da Carteira contém o do app ("Nubank Ultravioleta" → "Nubank"), ou o contrário, palavra inteira, sem acento nem caixa; havendo mais de um, o nome mais longo. Sem cartão reconhecido, entra como gasto comum da conta guardando o nome que veio (`Transaction.walletCardName`), e Cartões pergunta uma vez "de qual cartão é?" (`WalletCardAlias`): escolhido o cartão, as compras daquele nome já lançadas vão para a fatura e as próximas vão direto; "é débito" deixa na conta e não pergunta mais. A resposta da pessoa vale antes do palpite pelo nome.
- **Categoria:** a do último lançamento com a mesma descrição (loja), se houver.
- **Data:** o dia de hoje, à vista. Parcelado e "emprestado" se acertam editando depois.
- Fica de fora o que não passa pela Carteira: cartão físico, Pix, débito automático.

As regras puras (valor em "R$ 1.234,56", casamento de cartão) estão em `src/lib/shortcut.ts`.

## Avisos no celular (21/10)

Web Push no app instalado na tela de início (iOS 16.4+). A pessoa liga em **Avisos no celular**, no fim da Início; cada aparelho vira um `PushSubscription`, e um endereço que o serviço de push diz não existir mais (404/410) sai sozinho. Só existe aviso quando há algo a fazer — nunca "está tudo bem".

- **Pela manhã** (agendador da Vercel, `vercel.json`, 11h UTC = 8h em Brasília; `GET /api/avisos/diario` com `CRON_SECRET`): conta fixa que vence amanhã e não foi paga; fatura que vence hoje e não foi paga; fatura que fecha hoje (dia de fechamento, ou o último dia de um mês mais curto); renda prevista para hoje ainda não confirmada.
- **Na hora**, quando uma compra chega pelo atalho e o gasto do dia (lançamentos + compras no cartão com a data de hoje) passa do "quanto posso gastar hoje" do começo do dia — o mesmo `todayBudget`, recalculado sem os gastos de hoje. Um aviso por dia, substituído a cada compra.

As regras estão em `src/lib/alerts.ts`; o envio, em `src/lib/push.ts`. Sem `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` no ambiente, o bloco não aparece e nada é enviado.

## Fatias da renda (22/10)

A renda do período (a confirmada, de um pagamento ao próximo) é dividida em seis fatias com porcentagem ajustável que soma 100% — padrão 30 Custos fixos · 15 Conforto · 15 Metas · 10 Prazeres · 5 Conhecimento · 25 Liberdade financeira. Decisões do usuário:

- **As fatias de guardar (Metas e Liberdade financeira) saem do número do dia.** `todayBudget` reserva o que ainda falta guardar no período (`savingReserve`): a meta menos o que já foi para as caixinhas, que já saiu do saldo e não conta de novo. A reserva nunca deixa o número do dia negativo; o que não couber vira o aviso "este período não fecha com tudo guardado".
- **O guardado é o das caixinhas**, cada uma marcada como Metas ou Liberdade financeira (padrão: Liberdade).
- **Cada categoria pertence a uma fatia de gastar**, com palpite pelo nome (Moradia/Saúde/Transporte → Custos fixos, Alimentação → Conforto, Lazer → Prazeres, Educação → Conhecimento; o resto, Conforto). O gasto vem do mesmo `loadHistoryItems` do Histórico — lançamentos, parcelas por fatura, assinaturas e contas fixas pagas — mais as contas fixas do período ainda não pagas, que já estão comprometidas. O emprestado fica de fora.
- Gasto sem categoria não entra em fatia nenhuma; a tela Metas lista e deixa categorizar ali mesmo.
- Aviso no celular quando uma compra do atalho leva uma fatia de gastar além de 90% do previsto (só na travessia).
- Sem fatias configuradas (`User.budgetSlices` nulo), nada muda no número do dia.

Regras em `src/lib/slices.ts`; dados em `src/lib/slices-data.ts`; telas em `/metas` e `/metas/ajustar`.

## Listagem de transações (22/10)

A aba Lançamentos do Histórico vira uma listagem para arrumar o período: busca por descrição; filtros de entrada/saída, categoria (inclusive "sem categoria") e conta ou cartão; ordem por data, descrição ou valor; totais do que está filtrado; 25 por página. No computador é uma tabela; no celular, linhas com os menus embaixo.

- Categoria e **fatia** se trocam na própria linha, só em lançamentos e compras no cartão (o resto vem de outras telas e só aparece). A fatia de um lançamento (`Transaction.slice`, `CardPurchase.slice`) vale mais que a da categoria — decisão do usuário —, e "Pela categoria" volta a seguir a categoria.
- Seleção de vários para dar a mesma categoria ou apagar de uma vez (apagar leva junto o empréstimo ligado, como apagar um só).

## Calendário de gastos (22/10)

Num período de dias (semana, mês, intervalo até 62 dias), o Histórico troca a linha "Gasto por dia" por um calendário: cada dia pintado pelo quanto saiu nele, em quatro tons de rosé graduados em raiz quadrada do dia mais pesado (um dia de viagem não apaga o resto do mês). Tocar um dia mostra o que foi gasto nele; abre em hoje, ou no dia mais pesado de um período passado.

- Só o **dia a dia** entra: lançamentos de saída e compras no cartão **no dia em que foram feitas**, com o valor inteiro da compra (`src/lib/spending-calendar.ts`). Contas fixas e faturas ficam de fora — são o planejado, e pintariam o dia do aluguel todo mês. Por isso o total do calendário não é o "Gasto" do resumo, e o texto do card diz isso.
- Períodos de mais de dois meses continuam com a linha por mês.

## Rendimento das caixinhas (23/10)

Cada caixinha pode dizer quanto do CDI rende (`Jar.cdiPercent`, ex. 100). Com isso, "Quanto rende?" no card e o "Guardar" mostram o que um valor guardado hoje devolve na data do resgate — por padrão, o dia do próximo pagamento (`periodEnd` do orçamento):

- O CDI vem do Banco Central (SGS 4389, taxa DI anualizada base 252), buscado no máximo a cada 12 horas; fora do ar, uma estimativa marcada como tal, num campo que a pessoa corrige (`src/lib/cdi.ts`).
- Rende por dia útil: diária = (1 + CDI)^(1/252) − 1, vezes a % do CDI; conta os dias úteis de [hoje, resgate), sem fins de semana e feriados nacionais (os fixos, carnaval, Sexta-feira Santa e Corpus Christi pela Páscoa).
- Do bruto saem o IOF regressivo (96% no 1º dia a 3% no 29º, zero a partir de 30) e o IR sobre o que sobra (22,5% até 180 dias, 20%, 17,5%, 15%). A tela mostra o que sai no dia, o ganho líquido e, com IOF, quanto daria esperar os 30 dias (`src/lib/jar-yield.ts`).
- **A data de cada entrada conta.** Guardar e resgatar aceitam o dia em que o dinheiro entrou ou saiu de verdade (padrão hoje; nunca no futuro), gravado como meio-dia daquele dia — é dele que o rendimento, o IOF e o IR contam, e o movimento cai no período desse dia. O "Quanto rende?" divide o saldo nas entradas que o formam, cada uma com a sua data, com os resgates saindo das mais antigas primeiro (`remainingLots`); o que o saldo tem e os movimentos não explicam conta desde a criação da caixinha.
- É simulação: não entra no orçamento nem no saldo. O rendimento de verdade continua entrando pelo resgate.

## Resgate previsto: dinheiro estacionado (23/10)

Guardar pode dizer **"Vou tirar numa data"** (`JarDeposit.plannedWithdrawalAt`, um dia de calendário). O dinheiro sai da caixinha para pagar alguma coisa, então a data sugerida é a da **maior das próximas contas** (o aluguel, em geral), com atalhos para cada conta a pagar deste ciclo e do seguinte e para o próximo salário. Esse dinheiro não é guardado — está estacionado rendendo até o dia de usar:

- **Sai do disponível no dia em que entra**, como todo depósito, e **volta no dia previsto**: no orçamento do período (`jarReturnTotal` soma ao resultado; com saldo em conta, entra no "a chegar" enquanto o dia não passou) e na Previsão, como "Voltam das caixinhas". Assim um ciclo não fica no vermelho por causa de um dinheiro que já tem dia para voltar — e o "Posso comprar isso?", que usa a mesma projeção, também conta com ele.
- **Não conta como guardado nas fatias** (`parkedDepositTotal` sai do guardado do período, e a tela das Metas ignora esses depósitos).
- **O que já voltou sai da conta sozinho:** cada resgate de verdade da caixinha abate os previstos, o de data mais próxima primeiro, entre os depósitos feitos até ele (`src/lib/jar-plans.ts`). É calculado na hora, não gravado, então desfazer um resgate devolve o previsto.
- **Dia passado sem resgate:** deixa de contar na Previsão (o dinheiro continua na caixinha, não pode virar saldo) e o card da caixinha avisa em vermelho que era para ter voltado.

