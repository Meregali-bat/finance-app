import type { Metadata } from "next";
import Link from "next/link";
import { CONTROLLER, LEGAL_VERSION, PRICING, TO_FILL } from "@/lib/legal";
import { CDC_URL, ContactEmail, DocHeader, DraftNotice, Ext, H2, List } from "@/components/legal-parts";

export const metadata: Metadata = {
  title: "Termos de uso · Leeway",
  description: "As regras de uso do Leeway, da assinatura e do cancelamento.",
};

/*
 * RASCUNHO, sem revisão jurídica. Preço, período de teste e meio de pagamento
 * ainda não foram definidos: ficam em PRICING (src/lib/legal.ts).
 */
export default function TermsPage() {
  return (
    <>
      <DocHeader title="Termos de uso" version={LEGAL_VERSION} />
      <DraftNotice />

      <p>
        Estes termos são o contrato entre você e {CONTROLLER.name}
        {CONTROLLER.document ? ` (${CONTROLLER.document})` : ` (documento ${TO_FILL})`}, responsável
        pelo Leeway. Ao criar a conta, você declara que leu e aceita estes termos e a{" "}
        <Link href="/privacidade" className="underline underline-offset-2">
          política de privacidade
        </Link>
        .
      </p>

      <H2>1. O que é o Leeway</H2>
      <p>
        Um app para organizar o dinheiro entre um pagamento e o próximo e responder quanto você pode
        gastar hoje. O número do dia é uma estimativa calculada a partir do que <em>você</em>{" "}
        lança: se um dado estiver errado ou faltando, o número também estará. O Leeway não é banco,
        não movimenta dinheiro, não se conecta à sua conta bancária e não dá recomendação de
        investimento. As decisões de gasto são suas.
      </p>

      <H2>2. Sua conta</H2>
      <List>
        <li>Você precisa ter 18 anos ou mais.</li>
        <li>A conta é pessoal. Guarde sua senha; você responde pelo que for feito com ela.</li>
        <li>
          Ainda não há recuperação de senha automática. Se esquecer, peça para <ContactEmail />.
        </li>
        <li>Informe dados verdadeiros e lance só o que for seu.</li>
      </List>

      <H2>3. Assinatura</H2>
      <p>O Leeway é um serviço pago, por assinatura.</p>
      <List>
        <li>
          <strong>Preço e periodicidade:</strong> {PRICING.price ?? TO_FILL}.
        </li>
        <li>
          <strong>Período de teste:</strong>{" "}
          {PRICING.trialDays != null ? `${PRICING.trialDays} dias` : TO_FILL}.
        </li>
        <li>
          <strong>Pagamento:</strong> processado por {TO_FILL}. O Leeway não guarda número de cartão.
        </li>
        <li>
          <strong>Renovação:</strong> a assinatura renova sozinha ao fim de cada período, até você
          cancelar. Mudanças de preço são avisadas com antecedência de {TO_FILL} e só valem a partir
          da renovação seguinte.
        </li>
        <li>
          <strong>Cancelamento:</strong> a qualquer momento, pelo mesmo meio usado para assinar ({TO_FILL}), sem multa. O
          acesso continua até o fim do período já pago.
        </li>
        <li>
          <strong>Arrependimento:</strong> como a contratação é pela internet, você pode desistir em
          até 7 dias da assinatura e recebe de volta tudo o que pagou (
          <Ext href={CDC_URL}>Código de Defesa do Consumidor</Ext>, art. 49).
        </li>
      </List>

      <H2>4. Análises com IA</H2>
      <p>
        As análises com IA são opcionais, dependem da sua autorização para enviar dados à Anthropic
        (veja a{" "}
        <Link href="/privacidade#ia" className="underline underline-offset-2">
          política de privacidade
        </Link>
        ) e têm um limite de uso por período. A IA pode errar: confira cada sugestão antes de aplicar.
        Nada muda sozinho, cada correção depende de um toque seu.
      </p>

      <H2>5. O que não é permitido</H2>
      <List>
        <li>Usar a conta de outra pessoa ou lançar dados de terceiros sem necessidade.</li>
        <li>Tentar acessar dados de outras contas, sobrecarregar ou atacar o serviço.</li>
        <li>Automatizar o uso fora dos recursos oferecidos (como o atalho do iPhone).</li>
        <li>Revender ou copiar o serviço.</li>
      </List>
      <p>Descumprir estas regras pode levar à suspensão da conta, com aviso por e-mail.</p>

      <H2>6. Disponibilidade</H2>
      <p>
        Fazemos o possível para o app ficar no ar e os dados seguros, mas pode haver interrupções
        para manutenção ou por falha de fornecedores. Se o serviço for encerrado, você será avisado
        com {TO_FILL} de antecedência e poderá pedir a exportação dos seus dados.
      </p>

      <H2>7. Responsabilidade</H2>
      <p>
        Respondemos pelos danos causados pelo serviço nos termos do Código de Defesa do Consumidor.
        Não respondemos por decisões tomadas a partir de dados lançados errado, nem por falhas de
        bancos, do aparelho ou da conexão de internet.
      </p>

      <H2>8. Encerrar a conta</H2>
      <p>
        Você pode encerrar a conta quando quiser. Hoje isso é feito por pedido para <ContactEmail />;
        um botão no app está a caminho. Ao encerrar, seus dados são apagados como descrito na
        política de privacidade.
      </p>

      <H2>9. Mudanças nos termos</H2>
      <p>
        Cada mudança ganha uma nova versão, com a data no topo, e o app pede seu aceite de novo
        antes de você continuar. Se não concordar, você pode cancelar a assinatura e encerrar a
        conta.
      </p>

      <H2>10. Lei e foro</H2>
      <p>
        Valem as leis do Brasil. Eventuais disputas podem ser levadas ao foro do seu domicílio
        (Código de Defesa do Consumidor, art. 101, I).
      </p>
    </>
  );
}
