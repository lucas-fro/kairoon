import type { ReactNode } from 'react'
import { Lock, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { usePlan } from '../../hooks/usePlan'
import type { PlanFeatureKey } from '../../types/api'
import { Button } from '../ui/Button'
import { Skeleton } from '../ui/Skeleton'

const FEATURE_INFO: Record<PlanFeatureKey, { title: string; plan: string; description: string }> = {
  personalizacao: {
    title: 'Página personalizada',
    plan: 'Básico',
    description:
      'Personalize a cor e o banner e remova a marca Kairoon da sua página de agendamento.',
  },
  estoque: {
    title: 'Controle de estoque',
    plan: 'Básico',
    description: 'Cadastre produtos, controle quantidades e acompanhe o estoque do seu negócio.',
  },
  fidelidade: {
    title: 'Fidelidade',
    plan: 'Básico',
    description: 'Crie cartões de fidelidade e programas de pontos para reter seus clientes.',
  },
  relatorios: {
    title: 'Relatórios',
    plan: 'Básico',
    description: 'Acompanhe faturamento, ocupação, serviços e clientes com relatórios completos.',
  },
  financeiro: {
    title: 'Controle financeiro',
    plan: 'Essencial',
    description: 'Gerencie fluxo de caixa, despesas recorrentes, comissões e formas de pagamento.',
  },
  cupons: {
    title: 'Cupons e campanhas',
    plan: 'Essencial',
    description: 'Crie cupons de desconto e campanhas automáticas de marketing.',
  },
}

/**
 * Envolve um recurso pago: mostra o conteúdo quando o plano libera a feature,
 * ou um cartão de upgrade quando não. A regra real vive no backend (getPlan
 * devolve o mapa de features); aqui é só a camada de UX.
 */
export function FeatureGate({ feature, children }: { feature: PlanFeatureKey; children: ReactNode }) {
  const navigate = useNavigate()
  const { data, isPending } = usePlan()

  if (isPending) {
    return (
      <div className="w-full">
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  }

  if (data?.features[feature]) return <>{children}</>

  const info = FEATURE_INFO[feature]
  return (
    <div className="w-full py-6">
      <div className="mx-auto flex max-w-lg flex-col items-center rounded-2xl border border-line bg-surface px-6 py-10 text-center shadow-card">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary-light">
          <Lock className="h-6 w-6 text-primary" />
        </span>
        <p className="mt-4 text-xs font-medium uppercase tracking-wide text-secondary">
          Plano {info.plan}
        </p>
        <h2 className="mt-1 font-display text-xl font-semibold text-ink">{info.title}</h2>
        <p className="mt-2 max-w-sm text-sm text-ink-secondary">{info.description}</p>
        <Button
          className="mt-6"
          onClick={() => navigate('/app/configuracoes?tab=plano')}
          leftIcon={<Sparkles className="h-4 w-4" />}
        >
          Fazer upgrade para o {info.plan}
        </Button>
      </div>
    </div>
  )
}
