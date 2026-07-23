import { useSearchParams } from 'react-router-dom'
import { AccountTab } from '../../components/settings/AccountTab'
import { AppearanceTab } from '../../components/settings/AppearanceTab'
import { EmployeesTab } from '../../components/settings/EmployeesTab'
import { EstablishmentTab } from '../../components/settings/EstablishmentTab'
import { PlanTab } from '../../components/settings/PlanTab'
import { ServicesTab } from '../../components/settings/ServicesTab'
import { TimeBlocksCard } from '../../components/settings/TimeBlocksCard'
import { WorkingHoursTab } from '../../components/settings/WorkingHoursTab'
import { PageHeader } from '../../components/ui/PageHeader'
import { PageLoader } from '../../components/ui/Spinner'
import { useAuth } from '../../contexts/AuthContext'

// A navegação entre seções agora vive na sidebar (dropdown "Configurações");
// aqui só validamos o ?tab= e renderizamos a seção ativa.
const TABS = [
  'estabelecimento',
  'servicos',
  'funcionarios',
  'funcionamento',
  'aparencia',
  'plano',
  'conta',
] as const

const DEFAULT_TAB = 'estabelecimento'

export function SettingsPage() {
  const { establishment } = useAuth()
  const [searchParams] = useSearchParams()

  const tabParam = searchParams.get('tab')
  const activeTab = TABS.some((tab) => tab === tabParam) ? (tabParam as string) : DEFAULT_TAB

  if (!establishment) return <PageLoader />

  return (
    <div className="w-full">
      <PageHeader title="Configurações" />

      {activeTab === 'estabelecimento' && <EstablishmentTab establishment={establishment} />}
      {activeTab === 'servicos' && <ServicesTab />}
      {activeTab === 'funcionarios' && <EmployeesTab />}
      {activeTab === 'funcionamento' && (
        <div className="space-y-6">
          <WorkingHoursTab />
          <TimeBlocksCard />
        </div>
      )}
      {activeTab === 'aparencia' && <AppearanceTab establishment={establishment} />}
      {activeTab === 'plano' && <PlanTab />}
      {activeTab === 'conta' && <AccountTab />}
    </div>
  )
}
