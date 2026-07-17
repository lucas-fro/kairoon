import { LegalPageLayout } from './LegalPageLayout'

export function PrivacyPolicyPage() {
  return (
    <LegalPageLayout current="privacidade" title="Política de Privacidade" updatedAt="17 de julho de 2026">
      <p>
        Esta Política de Privacidade explica como a Kairoon coleta, usa, armazena, compartilha e
        protege dados pessoais, em conformidade com a Lei Geral de Proteção de Dados (Lei nº
        13.709/2018, "LGPD"). Ela se aplica aos donos de estabelecimento que contratam nossa
        plataforma, aos membros de suas equipes e aos clientes finais que agendam horários através
        do link público de agendamento.
      </p>

      <h2>1. Quem é o responsável pelos dados</h2>
      <p>
        A plataforma Kairoon é operada pela empresa responsável pela Kairoon ("nós"), que atua como
        controladora dos dados dos contratantes. Para tratar de qualquer assunto relacionado a dados
        pessoais, incluindo o contato com o nosso Encarregado (DPO), utilize o e-mail{' '}
        <strong>contato@kairoon.com.br</strong>.
      </p>

      <h2>2. Papéis: controladora e operadora</h2>
      <p>
        Em relação aos dados do <strong>contratante e da sua equipe</strong>, a Kairoon atua como{' '}
        <strong>controladora</strong>, decidindo sobre as finalidades do tratamento. Em relação aos
        dados dos <strong>clientes finais</strong>, inseridos ou coletados pelo estabelecimento, o
        estabelecimento é o <strong>controlador</strong> desses dados e a Kairoon atua como{' '}
        <strong>operadora</strong>, tratando-os por conta e ordem do estabelecimento apenas para
        viabilizar a agenda daquele negócio.
      </p>

      <h2>3. Dados que coletamos</h2>
      <p>
        <strong>3.1 Do contratante e do estabelecimento:</strong> nome, e-mail, telefone, CPF ou
        CNPJ, data de nascimento, senha (armazenada de forma criptografada), nome, endereço e
        contatos do estabelecimento, tipo de negócio e demais informações fornecidas no cadastro e
        nas configurações.
      </p>
      <p>
        <strong>3.2 Dos clientes finais</strong> (coletados através do link público de agendamento):
        nome, telefone, e-mail, data de nascimento e gênero (quando informados), além do histórico
        de agendamentos, serviços escolhidos, presenças e observações registradas pelo
        estabelecimento.
      </p>
      <p>
        <strong>3.3 Dados de pagamento:</strong> ao assinar um plano pago, coletamos nome do titular
        do cartão, CPF ou CNPJ, endereço de cobrança e os dados do cartão de crédito. Os dados do
        cartão são transmitidos de forma criptografada ao nosso processador de pagamento (Asaas)
        para efetivar a cobrança. A Kairoon <strong>não armazena</strong> o número completo do cartão
        nem o código de segurança (CVV). Guardamos apenas informações da assinatura necessárias para
        gerenciá-la, como plano, ciclo, status e identificadores da transação junto ao processador.
      </p>
      <p>
        <strong>3.4 Dados de uso e técnicos:</strong> registros de acesso, endereço IP (usado também
        para prevenção a fraude no pagamento), data e hora de operações, tipo de dispositivo e
        navegador, e dados de cookies e armazenamento local necessários ao funcionamento.
      </p>

      <h2>4. Bases legais</h2>
      <p>Tratamos dados pessoais com fundamento nas seguintes bases legais da LGPD:</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Execução de contrato</strong> (art. 7º, V): para criar e manter a conta, prestar o
          serviço e processar assinaturas e pagamentos.
        </li>
        <li>
          <strong>Cumprimento de obrigação legal ou regulatória</strong> (art. 7º, II): para guarda
          de registros e obrigações fiscais e contábeis.
        </li>
        <li>
          <strong>Legítimo interesse</strong> (art. 7º, IX): para segurança, prevenção a fraude e
          melhoria da plataforma, sempre respeitando seus direitos.
        </li>
        <li>
          <strong>Consentimento</strong> (art. 7º, I): quando aplicável, para comunicações não
          essenciais.
        </li>
      </ul>

      <h2>5. Como usamos os dados</h2>
      <p>
        Usamos os dados para viabilizar o funcionamento da agenda, autenticar o acesso à conta,
        processar assinaturas e pagamentos, enviar notificações e lembretes de agendamento, enviar
        comprovantes e comunicações transacionais, gerar relatórios financeiros e de desempenho para
        o estabelecimento, prevenir fraudes e prestar suporte quando solicitado.
      </p>

      <h2>6. Compartilhamento com terceiros</h2>
      <p>
        Não vendemos dados pessoais. Compartilhamos informações apenas com prestadores que nos
        ajudam a operar a plataforma, na medida necessária, entre eles:
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Asaas:</strong> processamento de pagamentos e cobrança das assinaturas.
        </li>
        <li>
          <strong>Provedores de hospedagem e infraestrutura:</strong> armazenamento e execução da
          plataforma.
        </li>
        <li>
          <strong>Provedor de e-mail transacional:</strong> envio de e-mails de conta, comprovantes
          e avisos.
        </li>
        <li>
          <strong>Serviço de consulta de CEP:</strong> preenchimento automático de endereço.
        </li>
      </ul>
      <p>
        Também podemos compartilhar dados para cumprir obrigação legal, ordem de autoridade
        competente ou para exercer e defender direitos.
      </p>

      <h2>7. Transferência internacional</h2>
      <p>
        Alguns prestadores podem processar dados em servidores localizados fora do Brasil. Nesses
        casos, adotamos medidas para garantir que a transferência ocorra em conformidade com a LGPD
        e com um nível adequado de proteção.
      </p>

      <h2>8. Retenção e eliminação</h2>
      <p>
        Mantemos os dados pelo tempo necessário para cumprir as finalidades descritas nesta Política
        e as obrigações legais aplicáveis. Registros de transações e dados fiscais podem ser
        guardados pelos prazos exigidos por lei. Após esses prazos, os dados são eliminados ou
        anonimizados. A exclusão da conta remove os dados associados conforme descrito na página de{' '}
        <strong>Exclusão de Conta</strong>.
      </p>

      <h2>9. Armazenamento e segurança</h2>
      <p>
        Os dados ficam armazenados em servidores com controles de acesso restritos, o tráfego
        sensível é criptografado e as senhas nunca são guardadas em texto plano. Adotamos medidas
        técnicas e organizacionais para proteger os dados, mas nenhum sistema é totalmente infalível,
        e recomendamos que você use uma senha forte e não a compartilhe.
      </p>

      <h2>10. Cookies e armazenamento local</h2>
      <p>
        Utilizamos cookies e armazenamento local do navegador estritamente necessários para manter
        sua sessão autenticada e lembrar preferências de uso da plataforma.
      </p>

      <h2>11. Seus direitos</h2>
      <p>
        Nos termos da LGPD (art. 18), você pode, a qualquer momento, solicitar: confirmação da
        existência de tratamento; acesso aos dados; correção de dados incompletos ou desatualizados;
        anonimização, bloqueio ou eliminação de dados desnecessários; portabilidade; informação
        sobre compartilhamentos; e revogação do consentimento. A exclusão completa da conta e dos
        dados associados pode ser feita diretamente pelo painel (veja a página de{' '}
        <strong>Exclusão de Conta</strong>) ou solicitada pelo e-mail de contato. Se você é um
        cliente final, direcione seus pedidos ao estabelecimento, que é o controlador desses dados;
        podemos apoiá-lo tecnicamente quando necessário.
      </p>

      <h2>12. Dados de crianças e adolescentes</h2>
      <p>
        A plataforma é destinada a maiores de 18 anos. Dados de menores eventualmente registrados
        como clientes finais são de responsabilidade do estabelecimento, que deve obter o
        consentimento específico de um dos pais ou responsável, quando exigido por lei.
      </p>

      <h2>13. Alterações desta Política</h2>
      <p>
        Podemos atualizar esta Política periodicamente para refletir melhorias na plataforma ou
        mudanças legais. A data no topo desta página indica a versão mais recente, e mudanças
        relevantes serão comunicadas pelos canais habituais.
      </p>

      <h2>14. Contato</h2>
      <p>
        Dúvidas sobre privacidade, tratamento de dados ou para exercer seus direitos, entre em
        contato com o nosso Encarregado pelo e-mail <strong>contato@kairoon.com.br</strong>.
      </p>
    </LegalPageLayout>
  )
}
