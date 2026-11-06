import type { Metadata } from "next";
import Link from "next/link";
import { CONTROLLER, LEGAL_VERSION, TO_FILL } from "@/lib/legal";
import { ContactEmail, DocHeader, DraftNotice, Ext, H2, LGPD_URL, List } from "@/components/legal-parts";

export const metadata: Metadata = {
  title: "Política de privacidade · Leeway",
  description: "Quais dados o Leeway guarda, para quê, com quem compartilha e como exercer seus direitos.",
};

/*
 * RASCUNHO, sem revisão jurídica. Cada afirmação aqui precisa continuar
 * verdadeira em relação ao código: ao mudar o que o app coleta, envia ou
 * guarda, atualize este texto e LEGAL_VERSION em src/lib/legal.ts.
 */
export default function PrivacyPage() {
  return (
    <>
      <DocHeader title="Política de privacidade" version={LEGAL_VERSION} />
      <DraftNotice />

      <p>
        Esta política explica quais dados pessoais o Leeway trata, para quê, com quem eles são
        compartilhados e como você exerce seus direitos, como pede a Lei Geral de Proteção de Dados
        (<Ext href={LGPD_URL}>Lei nº 13.709/2018, LGPD</Ext>), art. 9º.
      </p>

      <H2>1. Quem é o responsável</H2>
      <p>
        O controlador dos dados (LGPD, art. 5º, VI) é {CONTROLLER.name}
        {CONTROLLER.document ? `, ${CONTROLLER.document}` : `, documento ${TO_FILL}`}. Para qualquer
        assunto de privacidade, escreva para <ContactEmail />. Esse é o canal de comunicação com o
        titular; o encarregado (LGPD, art. 41) é {TO_FILL}.
      </p>

      <H2>2. Que dados guardamos</H2>
      <List>
        <li>
          <strong>Conta:</strong> e-mail, senha (guardada só como hash bcrypt, nunca em texto),
          nome e foto, se você informar, e preferências de aparência.
        </li>
        <li>
          <strong>Dados financeiros que você lança:</strong> rendas, despesas fixas, gastos,
          categorias, cartões de crédito (nome, dia de fechamento e vencimento e limite, nunca o
          número do cartão), compras e faturas, caixinhas, saldo em conta e empréstimos.
        </li>
        <li>
          <strong>Dados de outras pessoas que você informa:</strong> o nome de quem te deve, nos
          empréstimos, e os nomes que aparecem nas descrições dos seus gastos e extratos (por
          exemplo, quem recebeu um Pix). Só lance o que for necessário.
        </li>
        <li>
          <strong>Extratos e prints:</strong> o PDF de extrato e as imagens de fatura que você envia
          são lidos na hora e não são guardados no servidor. Ficam guardados os lançamentos que você
          escolher importar. O resultado da leitura das prints fica salvo no seu aparelho.
        </li>
        <li>
          <strong>Avisos no celular:</strong> o endereço de entrega dos avisos que o navegador gera
          ao você ativá-los.
        </li>
        <li>
          <strong>Atalho do iPhone:</strong> só o hash da chave pessoal.
        </li>
        <li>
          <strong>Segurança:</strong> tentativas de login e cadastro, com o e-mail e o IP guardados
          só como hash e apagados depois de algumas horas; o registro de quando você usou as análises
          com IA (só a data e o tipo, sem o conteúdo), para o limite de uso.
        </li>
        <li>
          <strong>Aceites:</strong> quando e qual versão destes termos e desta política você aceitou,
          e quando autorizou ou revogou o envio de dados para a IA.
        </li>
        <li>
          <strong>Cookies:</strong> só os necessários, o da sessão (para você continuar conectado) e
          os de tema e cor. Não há cookies de publicidade nem de rastreamento.
        </li>
      </List>

      <H2>3. Para que usamos e com que base legal</H2>
      <List>
        <li>
          Calcular quanto você pode gastar, a previsão, o histórico e os avisos: é o serviço que você
          contratou. Base: execução de contrato (LGPD, art. 7º, V).
        </li>
        <li>
          Proteger as contas (limite de tentativas, cota de IA, registros de acesso): legítimo
          interesse (art. 7º, IX), limitado ao necessário.
        </li>
        <li>
          Enviar dados para a análise com IA: só com o seu consentimento, pedido à parte, antes do
          primeiro uso (art. 7º, I, e art. 33, VIII). Veja a seção 5.
        </li>
        <li>Cumprir obrigações legais ou ordens de autoridades (art. 7º, II).</li>
      </List>
      <p>
        Não vendemos seus dados, não mostramos anúncios e não usamos seus dados para nada além do que
        está aqui.
      </p>

      <H2>4. Com quem compartilhamos</H2>
      <p>Só com os fornecedores que fazem o app funcionar, cada um para a sua parte (art. 9º, V):</p>
      <List>
        <li>
          <strong>Vercel Inc.</strong> (Estados Unidos): hospeda o site e roda o servidor. Todos os
          dados passam por ela.
        </li>
        <li>
          <strong>Supabase Inc.</strong>: hospeda o banco de dados, em servidores na região{" "}
          {TO_FILL}.
        </li>
        <li>
          <strong>Anthropic PBC</strong> (Estados Unidos): só se você autorizar, nas análises com IA.
          Veja a seção 5.
        </li>
        <li>
          <strong>Serviço de avisos do seu navegador</strong> (Apple, Google ou Mozilla, conforme o
          aparelho): entrega os avisos que você ativou, com o texto do aviso.
        </li>
      </List>
      <p>
        Também podemos ter de entregar dados a autoridades quando a lei ou uma ordem judicial
        obrigar.
      </p>

      <H2 id="ia">5. Análises com inteligência artificial</H2>
      <p>
        As análises com IA (metas, conferência de extrato, de fatura e de prints) são opcionais e
        feitas pela Anthropic, nos Estados Unidos. Antes da primeira, o app pede sua autorização em
        destaque, separada destes termos. Sem ela, nenhum dado vai para a Anthropic e o resto do app
        funciona normalmente. O que vai em cada análise:
      </p>
      <List>
        <li>
          <strong>Metas:</strong> descrição e valor dos gastos dos últimos 3 períodos de pagamento
          (cerca de 90 dias), sua renda média, suas categorias e o que você guardou.
        </li>
        <li>
          <strong>Conferência de extrato:</strong> o PDF inteiro do extrato, que pode ter seu nome,
          CPF, dados da conta e nomes de terceiros, e os lançamentos do app no mesmo período.
        </li>
        <li>
          <strong>Conferência de fatura:</strong> nome do cartão, compras, assinaturas e previsões da
          fatura em aberto.
        </li>
        <li>
          <strong>Prints do cartão:</strong> as imagens que você enviar.
        </li>
      </List>
      <p>
        Pela política da Anthropic para a API, as entradas e respostas são apagadas em até 30 dias,
        salvo quando o conteúdo é sinalizado por violar a política de uso (até 2 anos) ou quando a
        lei exigir (
        <Ext href="https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data">
          fonte
        </Ext>
        ), e não são usadas para treinar modelos (
        <Ext href="https://www.anthropic.com/legal/commercial-terms">termos comerciais</Ext>). Você
        pode revogar a autorização quando quiser, no <Link href="/perfil" className="underline underline-offset-2">Perfil</Link>{" "}
        (art. 8º, § 5º). Revogar impede novos envios; o que já foi enviado segue a retenção da
        Anthropic descrita acima.
      </p>

      <H2>6. Transferência para outros países</H2>
      <p>
        Vercel e Anthropic ficam nos Estados Unidos, que não têm decisão de adequação da ANPD. A
        transferência para a Anthropic se apoia no seu consentimento específico e em destaque (LGPD,
        art. 33, VIII). A hospedagem na Vercel é necessária para executar o contrato com você
        (art. 33, IX, combinado com o art. 7º, V). {TO_FILL}: confirmar se os fornecedores oferecem
        as cláusulas-padrão contratuais da ANPD (Resolução CD/ANPD nº 19/2024), que seriam a base
        mais sólida.
      </p>

      <H2>7. Por quanto tempo</H2>
      <p>
        Enquanto sua conta existir. Ao apagar a conta, todos os dados ligados a ela são apagados
        juntos, salvo o que a lei obrigar a guardar. As tentativas de login são apagadas em poucas
        horas. As cópias de segurança do banco seguem o prazo do fornecedor ({TO_FILL}).
      </p>

      <H2>8. Seus direitos e como exercê-los hoje</H2>
      <p>Pela LGPD, art. 18, você pode pedir, a qualquer momento e sem custo:</p>
      <List>
        <li>confirmação de que tratamos seus dados e acesso a eles;</li>
        <li>correção de dados incompletos, inexatos ou desatualizados;</li>
        <li>anonimização, bloqueio ou eliminação do que for desnecessário ou excessivo;</li>
        <li>portabilidade dos dados;</li>
        <li>eliminação dos dados tratados com base no seu consentimento;</li>
        <li>informação sobre com quem compartilhamos;</li>
        <li>informação sobre não dar o consentimento e o que acontece se não der;</li>
        <li>revogação do consentimento.</li>
      </List>
      <p>
        <strong>Como funciona hoje, com honestidade:</strong> a maior parte dos dados você mesmo vê,
        corrige e apaga dentro do app, e a autorização da IA se revoga no Perfil. Mas{" "}
        <strong>
          ainda não há botão para apagar a conta, exportar os dados ou recuperar a senha
        </strong>
        . Enquanto não houver, peça por e-mail para <ContactEmail />, do endereço da sua conta. O
        pedido é atendido à mão, e a confirmação de acesso completa sai em até 15 dias (art. 19, II).
        A exportação é entregue em arquivo JSON.
      </p>
      <p>
        Se achar que seus direitos não foram atendidos, você pode reclamar à Autoridade Nacional de
        Proteção de Dados (<Ext href="https://www.gov.br/anpd">ANPD</Ext>).
      </p>

      <H2>9. Segurança</H2>
      <p>
        Usamos conexão criptografada (HTTPS), senhas com hash, isolamento entre contas em todas as
        consultas e limite de tentativas de login (LGPD, art. 46). Ainda não há confirmação de e-mail
        nem verificação em duas etapas. Nenhum sistema é perfeito: se houver um incidente que possa
        causar risco ou dano relevante a você, avisaremos você e a ANPD (art. 48).
      </p>

      <H2>10. Menores de idade</H2>
      <p>O Leeway é para maiores de 18 anos.</p>

      <H2>11. Mudanças nesta política</H2>
      <p>
        Cada mudança ganha uma nova versão, com a data no topo. Quando ela mudar, o app pede seu
        aceite de novo antes de você continuar. Veja também os{" "}
        <Link href="/termos" className="underline underline-offset-2">
          termos de uso
        </Link>
        .
      </p>
    </>
  );
}
