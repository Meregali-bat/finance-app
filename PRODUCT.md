# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Instalável como app (PWA) — manifest, ícone e barra de status do iPhone configurados. É web, não nativo: a linguagem visual é a do app, não a do iOS.

## Users

Pessoas no Brasil que recebem uma renda fixa (salário, pró-labore) em dias certos do mês e querem saber, todo dia, quanto podem gastar sem se enrolar até o próximo pagamento. Hoje o app é usado pelo próprio autor; a intenção confirmada é **abrir para outras pessoas**, cada uma com a própria conta.

O uso acontece em dois momentos, os dois confirmados:

- **No celular, no dia a dia**, pelo atalho na tela de início: ver o número do dia e lançar um gasto na hora.
- **No computador, para planejar**: olhar a previsão dos próximos ciclos, o histórico e os cartões com calma.

## Product Purpose

Responder uma pergunta: **quanto posso gastar hoje?** Um número diário honesto até o próximo pagamento, que já desconta as despesas fixas, as faturas do cartão, os lançamentos agendados e o que vai faltar em ciclos à frente.

Sucesso é a pessoa confiar nesse número a ponto de decidir um gasto por ele, e nunca descobrir depois que ele mentiu.

## Positioning

O período não é o mês do calendário: vai **de um pagamento ao próximo**, considerando todas as rendas fixas. Cada período herda o que sobrou ou faltou do anterior — ou parte do saldo real da conta, quando informado —, e o "livre para gastar" de hoje já reserva o dinheiro de um ciclo futuro que não vai se pagar. Um app de controle de gastos comum mostra o que já saiu; este diz quanto ainda pode sair, contando com o que vem.

## Operating Context

- Rotina: confirmar o salário quando cai, marcar contas e faturas como pagas (inteiras ou em parcelas), adiar uma conta, lançar gastos do dia, guardar sobra em caixinhas, conferir a previsão.
- Cartões de crédito com fechamento e vencimento: as compras entram na fatura do ciclo certo, parceladas mês a mês; o limite usado é acompanhado.
- O saldo em conta é corrigido à mão de tempos em tempos olhando o extrato do banco; depois disso, nada que já estava no extrato pode contar duas vezes.
- Bancos do usuário atual: Nubank e Sicoob (as cores de cartão do catálogo existem só para eles; outros entram quando alguém tiver o cartão).

## Capabilities and Constraints

- Funcionalidades confirmadas: orçamento diário encadeado entre períodos; previsão de até 24 ciclos com aviso de falta; rendas fixas, despesas fixas (com parcelas, pausa e adiamento), categorias; cartões, compras parceladas, faturas, previsões manuais na fatura e limite; pagamento parcial de despesa fixa e de fatura; saldo em conta com ajuste manual; caixinhas (guardar, resgatar — inclusive mais do que o saldo, pelo rendimento); empréstimos para outras pessoas com "a receber"; histórico por período e por categoria; simulação "posso comprar isso?"; tema claro, escuro e automático; lançamento automático de pagamentos por aproximação pelo app Atalhos do iPhone; avisos no celular (contas e faturas que vencem, fechamento, salário a confirmar, limite do dia estourado); importação de extratos em PDF (conta Nubank e Sicoob, fatura do cartão Sicoob) conferidos com o app; fatias da renda (seis potes) em que as de guardar saem do número do dia.
- Idioma e formato: português do Brasil, reais (BRL), fuso `America/Sao_Paulo`. Datas de calendário são guardadas em meia-noite UTC.
- Stack: Next.js (App Router) + Prisma + Postgres (Supabase), Auth.js com email e senha, hospedado na Vercel. Os cálculos de dinheiro vivem em módulos puros e testados (`src/lib/period.ts`, `carry-over.ts`, `forecast.ts`, `loans.ts` e vizinhos).
- O que entra no orçamento e como está documentado em `docs/superpowers/specs/2026-09-25-saldo-encadeado-design.md`; mudanças de regra são registradas lá.
- Cadastro aberto com email e senha na tela de login, seguido de um primeiro uso curto em `/comecar` (renda obrigatória; saldo, contas fixas e cartão opcionais) que termina mostrando o número do dia.
- **Em aberto:** o app não envia emails, então não há confirmação de email nem recuperação de senha (a senha é redefinida por quem administra). Faltam também política de dados, exclusão de conta e limite de tentativas no cadastro. Não há integração bancária: fora o que passa pela Carteira do iPhone (atalho), tudo é lançado à mão.

## Brand Commitments

- Nome: **Leeway** (wordmark "leeway", em minúsculas) — a folga, a margem que ainda dá para gastar. Até 21/10 se chamava "Finanças". O texto do app continua em português; só o nome é em inglês.
- Logo "o anel do ciclo": o anel é o período entre pagamentos, a abertura é o que falta e o ponto é hoje (`src/components/logo.tsx`, ícones em `src/app/icon.svg`, `apple-icon.png`, `public/icons/`).
- Voz: português direto e em segunda pessoa ("Você pode gastar hoje", "Vai faltar ao fim do período"), números sempre com o contexto do que significam.

## Evidence on Hand

- Usuário de demonstração do seed (`prisma/seed.ts`), com rendas, despesas, cartão e lançamentos de exemplo.
- Não há depoimentos, usuários externos, métricas de uso nem preços. Nada disso deve ser inventado.

## Product Principles

1. **O número do dia é a promessa.** Toda tela e toda regra existem para que "quanto posso gastar hoje" seja verdade; nada pode inflá-lo com dinheiro que ainda não chegou ou que vai faltar adiante.
2. **Cada mês leva em conta o anterior.** Sobra e falta passam adiante; um ajuste de saldo é a verdade do banco e nada que ele já contém conta de novo.
3. **Dinheiro nunca some em silêncio.** Conta vencida segue lembrada, recebimento não confirmado fica fora da conta mas à vista, toda ação de dinheiro pode ser desfeita.
4. **Rápido no celular, completo no computador.** Lançar e confirmar em poucos toques; planejar com o detalhe todo à mão.
