import { LegalPageLayout } from './LegalPageLayout'

export function AccountDeletionPage() {
  return (
    <LegalPageLayout current="exclusao" title="Exclusão de Conta" updatedAt="7 de julho de 2026">
      <p>
        Você pode excluir sua conta Kairoon e todos os dados associados a ela a qualquer momento,
        diretamente pelo painel, sem precisar entrar em contato com o suporte. Esta página explica
        o passo a passo e o que exatamente acontece com os seus dados.
      </p>

      <h2>1. Como excluir sua conta</h2>
      <p>
        Acesse sua conta em kairoon.app, vá até <strong>Configurações</strong> e abra a aba{' '}
        <strong>Conta</strong>. Na seção <strong>Zona de perigo</strong>, clique em{' '}
        <strong>"Excluir conta e todos os dados"</strong> e confirme a ação na janela de
        confirmação que será exibida.
      </p>

      <h2>2. O que é excluído</h2>
      <p>
        A exclusão remove permanentemente o estabelecimento, a agenda, os clientes cadastrados, os
        serviços, os funcionários, o histórico financeiro e o link público de agendamento, que
        deixa de funcionar imediatamente após a confirmação.
      </p>

      <h2>3. A ação é imediata e irreversível</h2>
      <p>
        Assim que a exclusão é confirmada, os dados são apagados definitivamente dos nossos
        sistemas e não podem ser recuperados. Não é possível reverter a exclusão nem restaurar uma
        conta excluída, então recomendamos exportar relatórios importantes antes de prosseguir.
      </p>

      <h2>4. Se você não consegue acessar a conta</h2>
      <p>
        Caso tenha perdido o acesso ao e-mail ou à senha e não consiga entrar no painel para
        excluir a conta por conta própria, entre em contato pelo e-mail{' '}
        <strong>suporte@kairoon.app</strong> solicitando a exclusão. Podemos pedir informações para
        confirmar que você é o titular da conta antes de prosseguir.
      </p>

      <h2>5. Dados de clientes finais</h2>
      <p>
        Os dados de clientes que agendaram horários através do link público (nome, telefone,
        e-mail e histórico de agendamentos) pertencem ao estabelecimento e são excluídos junto com
        a conta, já que existem apenas para viabilizar a agenda daquele negócio.
      </p>

      <p>
        Para entender como tratamos seus dados antes da exclusão, consulte nossa{' '}
        <strong>Política de Privacidade</strong>, e para conhecer as regras gerais de uso da
        plataforma, veja os <strong>Termos de Uso</strong>.
      </p>
    </LegalPageLayout>
  )
}
