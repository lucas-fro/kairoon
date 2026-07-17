import { Coins, Megaphone, Stamp, Ticket } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { CampaignsTab } from '../../components/marketing/CampaignsTab'
import { CouponsTab } from '../../components/marketing/CouponsTab'
import { LoyaltyCardTab } from '../../components/marketing/LoyaltyCardTab'
import { PointsTab } from '../../components/marketing/PointsTab'
import { FeatureGate } from '../../components/plan/FeatureGate'
import { PageHeader } from '../../components/ui/PageHeader'
import { SectionNav } from '../../components/ui/SectionNav'
import type { TabItem } from '../../components/ui/Tabs'

const TABS: TabItem[] = [
  { key: 'cupons', label: 'Cupons', icon: Ticket },
  { key: 'campanhas', label: 'Campanhas', icon: Megaphone },
  { key: 'cartao', label: 'Cartão fidelidade', icon: Stamp },
  { key: 'pontos', label: 'Pontos', icon: Coins },
]

// Abre no cartão de fidelidade (disponível já no plano Básico); cupons e
// campanhas exigem o Essencial e são gateados individualmente abaixo.
const DEFAULT_TAB = 'cartao'

export function MarketingPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const tabParam = searchParams.get('tab')
  const activeTab = TABS.some((tab) => tab.key === tabParam) ? (tabParam as string) : DEFAULT_TAB

  return (
    <div className="w-full">
      <PageHeader
        title="Fidelidade"
        description="Cupons, campanhas automáticas, cartão fidelidade e programa de pontos para atrair e reter clientes."
      />

      <SectionNav
        tabs={TABS}
        active={activeTab}
        onChange={(key) => setSearchParams({ tab: key })}
      >
        {activeTab === 'cupons' && (
          <FeatureGate feature="cupons">
            <CouponsTab />
          </FeatureGate>
        )}
        {activeTab === 'campanhas' && (
          <FeatureGate feature="cupons">
            <CampaignsTab />
          </FeatureGate>
        )}
        {activeTab === 'cartao' && (
          <FeatureGate feature="fidelidade">
            <LoyaltyCardTab />
          </FeatureGate>
        )}
        {activeTab === 'pontos' && (
          <FeatureGate feature="fidelidade">
            <PointsTab />
          </FeatureGate>
        )}
      </SectionNav>
    </div>
  )
}
