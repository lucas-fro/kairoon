import { LegalPageLayout } from './LegalPageLayout'

export function TermsOfServicePage() {
  return (
    <LegalPageLayout current="termos" title="Termos de Uso" updatedAt="17 de julho de 2026">
      <p>
        Estes Termos de Uso ("Termos") regulam o acesso e o uso da plataforma Kairoon, um sistema de
        agenda online e gestão para estabelecimentos como barbearias, salões de beleza e clínicas de
        estética. Ao criar uma conta, contratar um plano ou usar a plataforma de qualquer forma,
        você declara que leu, entendeu e concorda integralmente com estes Termos e com a nossa{' '}
        <strong>Política de Privacidade</strong>. Se você não concorda, não utilize a plataforma.
      </p>

      <h2>1. Definições</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Kairoon:</strong> a plataforma e a empresa responsável por sua operação.
        </li>
        <li>
          <strong>Contratante ou Estabelecimento:</strong> a pessoa física ou jurídica que cria uma
          conta para gerir seu negócio na plataforma.
        </li>
        <li>
          <strong>Usuário:</strong> qualquer pessoa que acessa a conta do Contratante (o dono ou
          membros da equipe autorizados).
        </li>
        <li>
          <strong>Cliente final:</strong> a pessoa que agenda um horário com o Estabelecimento
          através do link público de agendamento.
        </li>
        <li>
          <strong>Assinatura:</strong> a contratação de um plano pago, com cobrança recorrente.
        </li>
      </ul>

      <h2>2. Objeto e descrição do serviço</h2>
      <p>
        A Kairoon oferece uma agenda online, um link público de agendamento para os clientes do
        Estabelecimento, além de ferramentas de gestão de equipe, serviços, clientes, estoque,
        finanças, fidelidade e relatórios. A plataforma é uma ferramenta de apoio à gestão: a
        prestação dos serviços de beleza ou estética é de responsabilidade exclusiva do
        Estabelecimento perante seus Clientes finais.
      </p>

      <h2>3. Cadastro, elegibilidade e conta</h2>
      <p>
        Para criar uma conta você deve ter no mínimo 18 anos ou capacidade civil plena, e ser
        legalmente capaz de contratar. Você é responsável por fornecer informações verdadeiras,
        completas e atualizadas, por manter sua senha em sigilo e por todas as atividades realizadas
        na sua conta. Avise-nos imediatamente pelo e-mail <strong>contato@kairoon.com.br</strong> em
        caso de uso não autorizado ou suspeita de comprometimento da conta.
      </p>

      <h2>4. Link público de agendamento</h2>
      <p>
        O link público disponibilizado ao Estabelecimento é de uso exclusivo dele para receber
        agendamentos de seus próprios Clientes finais. O Estabelecimento é o responsável pelo
        conteúdo que publica (nome, descrição, serviços, preços e imagens) e por manter essas
        informações corretas. É proibido usar o link ou a plataforma para fins ilícitos, ofensivos,
        enganosos ou que violem direitos de terceiros.
      </p>

      <h2>5. Planos, assinatura e pagamento</h2>
      <p>
        <strong>5.1 Planos.</strong> A Kairoon oferece um plano gratuito com funcionalidades básicas
        e planos pagos com recursos adicionais. As funcionalidades, os limites e os preços de cada
        plano são apresentados na página de planos e no momento da contratação.
      </p>
      <p>
        <strong>5.2 Processador de pagamento.</strong> Os pagamentos das assinaturas são processados
        pela <strong>Asaas</strong> (Asaas Gestão Financeira Instituição de Pagamento S.A.), nosso
        provedor de pagamento. Ao assinar um plano pago, você também concorda com os termos e as
        políticas da Asaas aplicáveis ao processamento da transação.
      </p>
      <p>
        <strong>5.3 Teste grátis e cobrança recorrente.</strong> Novas assinaturas incluem um
        período de teste grátis de 14 dias: você tem acesso imediato ao plano e a primeira cobrança
        só ocorre ao fim desse período. Se cancelar antes do fim do teste, nada é cobrado. Após o
        teste, a assinatura passa a ser cobrada de forma recorrente e automática no ciclo escolhido
        (mensal ou anual), no cartão informado, até que seja cancelada. Ao contratar, você autoriza
        expressamente essas cobranças recorrentes.
      </p>
      <p>
        <strong>5.4 Dados do cartão.</strong> Os dados do cartão são coletados no checkout apenas
        para viabilizar a cobrança e são transmitidos de forma criptografada à Asaas para
        processamento. A Kairoon não armazena o número completo do cartão nem o código de segurança
        (CVV) em seus servidores. O tratamento desses dados está descrito na Política de
        Privacidade.
      </p>
      <p>
        <strong>5.5 Alteração de preços.</strong> Os preços podem ser alterados a qualquer momento.
        Mudanças de preço de um plano já contratado só passam a valer no ciclo seguinte e serão
        comunicadas com antecedência razoável, permitindo o cancelamento antes da renovação caso
        você não concorde com o novo valor.
      </p>
      <p>
        <strong>5.6 Inadimplência e período de tolerância.</strong> Se uma cobrança não for
        confirmada (por exemplo, cartão recusado ou sem saldo), a assinatura fica em atraso. Há um
        período de tolerância antes do bloqueio dos recursos pagos, durante o qual você pode
        regularizar o pagamento. Passado esse prazo sem regularização, a conta volta ao plano
        gratuito, sem exclusão automática dos dados.
      </p>
      <p>
        <strong>5.7 Cancelamento pelo assinante.</strong> Você pode cancelar a assinatura a qualquer
        momento pelo painel, na aba de plano em Configurações. O cancelamento interrompe as
        cobranças futuras e mantém o acesso aos recursos pagos até o fim do período já pago. Não há
        multa nem fidelidade.
      </p>
      <p>
        <strong>5.8 Direito de arrependimento.</strong> Nas contratações feitas pela internet, você
        tem o direito de se arrepender em até 7 (sete) dias corridos contados da data da
        contratação, nos termos do art. 49 do Código de Defesa do Consumidor. Nesse caso, o valor
        pago é integralmente devolvido. Para exercer esse direito, entre em contato pelo e-mail{' '}
        <strong>contato@kairoon.com.br</strong>.
      </p>
      <p>
        <strong>5.9 Reembolsos.</strong> Fora da hipótese de arrependimento do item 5.8, os valores
        já pagos referentes ao ciclo em curso não são reembolsáveis, salvo em caso de cobrança
        indevida comprovada ou quando exigido por lei.
      </p>
      <p>
        <strong>5.10 Tributos.</strong> Os preços podem incluir tributos aplicáveis. Você é
        responsável por quaisquer tributos incidentes sobre a sua própria atividade econômica.
      </p>

      <h2>6. Uso aceitável e condutas proibidas</h2>
      <p>Ao usar a plataforma, você concorda em não:</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>tentar acessar contas, dados ou áreas da plataforma sem autorização;</li>
        <li>
          interferir, sobrecarregar ou comprometer o funcionamento, a segurança ou a integridade da
          plataforma;
        </li>
        <li>
          extrair dados em massa, aplicar engenharia reversa ou copiar partes do software sem
          autorização expressa;
        </li>
        <li>
          usar o serviço para enviar conteúdo enganoso, discriminatório, fraudulento, difamatório ou
          ilegal;
        </li>
        <li>
          usar a plataforma para fins de fraude em pagamentos, teste de cartões ou lavagem de
          dinheiro.
        </li>
      </ul>

      <h2>7. Conteúdo e responsabilidade do Contratante</h2>
      <p>
        O Contratante é o responsável pelos dados que insere na plataforma, inclusive os dados dos
        seus Clientes finais, e garante que possui base legal para tratá-los. Em relação a esses
        dados, o Contratante atua como controlador e a Kairoon como operadora, conforme detalhado na
        Política de Privacidade.
      </p>

      <h2>8. Propriedade intelectual</h2>
      <p>
        A marca Kairoon, o software, o design, os textos e os demais elementos da plataforma
        pertencem à Kairoon ou aos seus licenciadores e são protegidos por lei. Nada nestes Termos
        transfere qualquer direito de propriedade intelectual a você, que recebe apenas uma licença
        limitada, não exclusiva e revogável de uso da plataforma enquanto durar a relação.
      </p>

      <h2>9. Disponibilidade e suporte</h2>
      <p>
        Trabalhamos para manter a plataforma disponível e estável, mas o serviço é fornecido "no
        estado em que se encontra", sem garantia de disponibilidade ininterrupta. Podem ocorrer
        manutenções programadas, atualizações e indisponibilidades pontuais decorrentes de fatores
        fora do nosso controle.
      </p>

      <h2>10. Limitação de responsabilidade</h2>
      <p>
        Na máxima extensão permitida pela lei, a Kairoon não se responsabiliza por acordos,
        atendimentos, cobranças ou conflitos entre o Estabelecimento e seus Clientes finais, por
        lucros cessantes, nem por danos indiretos decorrentes do uso ou da impossibilidade de uso da
        plataforma. Nada nestes Termos exclui responsabilidades que não possam ser afastadas por
        lei, em especial as relações de consumo aplicáveis.
      </p>

      <h2>11. Suspensão e encerramento</h2>
      <p>
        Você pode encerrar sua conta a qualquer momento pelo painel. A Kairoon pode suspender ou
        encerrar contas que violem estes Termos, que representem risco à segurança da plataforma ou
        que estejam envolvidas em fraude. Saiba o que acontece com seus dados na página de{' '}
        <strong>Exclusão de Conta</strong>.
      </p>

      <h2>12. Alterações destes Termos</h2>
      <p>
        Podemos atualizar estes Termos periodicamente. Mudanças relevantes serão comunicadas pelos
        canais habituais da plataforma, e a data no topo desta página indica a versão mais recente.
        O uso continuado do serviço após a atualização representa a aceitação dos novos Termos.
      </p>

      <h2>13. Legislação aplicável e foro</h2>
      <p>
        Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro do
        domicílio do consumidor para dirimir eventuais controvérsias, quando aplicável a relação de
        consumo, sem prejuízo de outras hipóteses previstas em lei.
      </p>

      <h2>14. Contato</h2>
      <p>
        Dúvidas sobre estes Termos podem ser enviadas para{' '}
        <strong>contato@kairoon.com.br</strong>.
      </p>
    </LegalPageLayout>
  )
}
