import { Navigate, useSearchParams } from 'react-router-dom'
import { AccountTab } from '../../components/settings/AccountTab'
import { AppearanceTab } from '../../components/settings/AppearanceTab'
import { EstablishmentTab } from '../../components/settings/EstablishmentTab'
import { PlanTab } from '../../components/settings/PlanTab'
import { TimeBlocksCard } from '../../components/settings/TimeBlocksCard'
import { WorkingHoursTab } from '../../components/settings/WorkingHoursTab'
import { PageHeader } from '../../components/ui/PageHeader'
import { PageLoader } from '../../components/ui/Spinner'
import { useAuth } from '../../contexts/AuthContext'

// A navegação entre seções agora vive na sidebar (dropdown "Configurações");
// aqui só validamos o ?tab= e renderizamos a seção ativa.
const TABS = ['estabelecimento', 'funcionamento', 'aparencia', 'plano', 'conta'] as const

type SettingsTab = (typeof TABS)[number]

export function SettingsPage() {
  const { establishment, can, isOwner } = useAuth()
  const [searchParams] = useSearchParams()

  const tabParam = searchParams.get('tab')

  // Serviços e Profissionais viraram páginas próprias na sidebar;
  // redireciona links antigos (?tab=) para as novas rotas.
  if (tabParam === 'servicos') return <Navigate to="/app/servicos" replace />
  if (tabParam === 'funcionarios') return <Navigate to="/app/funcionarios" replace />

  // Bloqueio por permissão não tem upgrade que resolva: a aba simplesmente não
  // existe para quem não pode. "Conta" fica livre porque são dados próprios.
  function isAllowed(tab: SettingsTab) {
    if (tab === 'conta') return true
    if (tab === 'plano') return isOwner
    return can('settings.manage')
  }

  // Sem DEFAULT_TAB fixo: a padrão é a primeira permitida (para o profissional
  // comum, "conta"). Um ?tab= proibido cai aqui também, em vez de renderizar
  // uma seção cujas chamadas o backend recusaria.
  const allowedTabs = TABS.filter(isAllowed)
  const activeTab = allowedTabs.find((tab) => tab === tabParam) ?? allowedTabs[0]

  if (!establishment) return <PageLoader />

  return (
    <div className="w-full">
      <PageHeader title="Configurações" />

      {activeTab === 'estabelecimento' && <EstablishmentTab establishment={establishment} />}
      {activeTab === 'funcionamento' && (
        <div className="space-y-6">
          <WorkingHoursTab />
          {/* Bloqueio é agenda, não configuração: as rotas de time-blocks pedem
              agenda.view/agenda.edit, e a lista de profissionais pede
              employees.view (que agenda.view já implica). Sem esta checagem o
              card monta com settings.manage e dispara duas queries 403. */}
          {can('agenda.view') && <TimeBlocksCard />}
        </div>
      )}
      {activeTab === 'aparencia' && <AppearanceTab establishment={establishment} />}
      {activeTab === 'plano' && <PlanTab />}
      {activeTab === 'conta' && <AccountTab />}
    </div>
  )
}
