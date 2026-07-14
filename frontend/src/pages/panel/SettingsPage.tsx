import { Clock, Crown, Palette, Scissors, Store, UserCog, Users } from 'lucide-react'
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
import { SectionNav } from '../../components/ui/SectionNav'
import { PageLoader } from '../../components/ui/Spinner'
import type { TabItem } from '../../components/ui/Tabs'
import { useAuth } from '../../contexts/AuthContext'

const TABS: TabItem[] = [
  { key: 'estabelecimento', label: 'Estabelecimento', icon: Store },
  { key: 'servicos', label: 'Serviços', icon: Scissors },
  { key: 'funcionarios', label: 'Colaboradores', icon: Users },
  { key: 'funcionamento', label: 'Expediente', icon: Clock },
  { key: 'aparencia', label: 'Aparência', icon: Palette },
  { key: 'plano', label: 'Plano', icon: Crown },
  { key: 'conta', label: 'Conta', icon: UserCog },
]

const DEFAULT_TAB = 'estabelecimento'

export function SettingsPage() {
  const { establishment } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const tabParam = searchParams.get('tab')
  const activeTab = TABS.some((tab) => tab.key === tabParam) ? (tabParam as string) : DEFAULT_TAB

  if (!establishment) return <PageLoader />

  return (
    <div className="w-full">
      <PageHeader title="Configurações" />

      <SectionNav
        tabs={TABS}
        active={activeTab}
        onChange={(key) => setSearchParams({ tab: key })}
      >
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
      </SectionNav>
    </div>
  )
}
