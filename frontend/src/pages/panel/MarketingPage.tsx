import { useSearchParams } from 'react-router-dom'
import { CampaignsTab } from '../../components/marketing/CampaignsTab'
import { CouponsTab } from '../../components/marketing/CouponsTab'
import { LoyaltyCardTab } from '../../components/marketing/LoyaltyCardTab'
import { PointsTab } from '../../components/marketing/PointsTab'
import { FeatureGate } from '../../components/plan/FeatureGate'
import { PageHeader } from '../../components/ui/PageHeader'

// A navegação entre seções agora vive na sidebar (dropdown "Fidelidade"); aqui
// só validamos o ?tab= e renderizamos a seção ativa. Abre no cartão de
// fidelidade (já no plano Básico); cupons e campanhas exigem o Essencial e são
// gateados individualmente abaixo.
const TABS = ['cupons', 'campanhas', 'cartao', 'pontos'] as const

const DEFAULT_TAB = 'cartao'

export function MarketingPage() {
  const [searchParams] = useSearchParams()

  const tabParam = searchParams.get('tab')
  const activeTab = TABS.some((tab) => tab === tabParam) ? (tabParam as string) : DEFAULT_TAB

  return (
    <div className="w-full">
      <PageHeader title="Fidelidade" />

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
    </div>
  )
}
