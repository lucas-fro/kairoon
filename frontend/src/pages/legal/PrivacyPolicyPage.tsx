import { LegalPageLayout } from './LegalPageLayout'

export function PrivacyPolicyPage() {
  return (
    <LegalPageLayout current="privacidade" title="Política de Privacidade" updatedAt="7 de julho de 2026">
      <p>
        Esta Política de Privacidade explica como a Kairoon coleta, usa, armazena e protege os
        dados pessoais dos donos de estabelecimento que contratam nossa plataforma e dos clientes
        finais que agendam horários através do link público de agendamento.
      </p>

      <h2>1. Dados que coletamos</h2>
      <p>
        Do dono da conta e do estabelecimento: nome, e-mail, telefone, CPF, data de nascimento,
        senha (armazenada de forma criptografada), nome e endereço do estabelecimento, formas de
        contato e demais informações fornecidas no cadastro e nas configurações.
      </p>
      <p>
        Dos clientes finais, coletados através do link público de agendamento: nome, telefone,
        e-mail, data de nascimento e gênero (quando informados), além do histórico de
        agendamentos, serviços escolhidos e presenças.
      </p>

      <h2>2. Como usamos os dados</h2>
      <p>
        Usamos os dados para viabilizar o funcionamento da agenda, autenticar o acesso à conta,
        enviar notificações e lembretes de agendamento, gerar relatórios financeiros e de
        desempenho para o estabelecimento, e para dar suporte quando solicitado.
      </p>

      <h2>3. Compartilhamento com terceiros</h2>
      <p>
        Não vendemos dados pessoais. Compartilhamos informações apenas com prestadores que nos
        ajudam a operar a plataforma, como serviços de hospedagem, envio de e-mail transacional e
        consulta de CEP, e somente na medida necessária para prestar o serviço contratado.
      </p>

      <h2>4. Armazenamento e segurança</h2>
      <p>
        Os dados ficam armazenados em servidores com controles de acesso restritos, e senhas nunca
        são guardadas em texto plano. Ainda assim, nenhum sistema é infalível, e recomendamos que
        você use uma senha forte e não a compartilhe com terceiros.
      </p>

      <h2>5. Cookies</h2>
      <p>
        Utilizamos cookies e armazenamento local do navegador estritamente necessários para manter
        sua sessão autenticada e lembrar preferências de uso da plataforma.
      </p>

      <h2>6. Seus direitos</h2>
      <p>
        Você pode solicitar a qualquer momento a confirmação, o acesso, a correção ou a exclusão
        dos seus dados pessoais. A exclusão completa da conta e de todos os dados associados pode
        ser feita diretamente pelo painel. Veja como na nossa página de{' '}
        <strong>Exclusão de Conta</strong>.
      </p>

      <h2>7. Alterações desta política</h2>
      <p>
        Podemos atualizar esta política periodicamente para refletir melhorias na plataforma ou
        mudanças legais. A data no topo desta página indica a versão mais recente.
      </p>

      <h2>8. Contato</h2>
      <p>
        Dúvidas sobre privacidade e tratamento de dados podem ser enviadas para{' '}
        <strong>suporte@kairoon.app</strong>.
      </p>
    </LegalPageLayout>
  )
}
