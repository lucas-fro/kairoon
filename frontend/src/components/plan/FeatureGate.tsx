import type { ReactNode } from 'react'
import { usePlan } from '../../hooks/usePlan'
import type { PlanFeatureKey } from '../../types/api'
import { Skeleton } from '../ui/Skeleton'
import { UpgradePrompt } from './UpgradePrompt'

/** Plano mínimo que libera cada recurso (só para a mensagem de upgrade). */
const FEATURE_MIN_PLAN: Record<PlanFeatureKey, string> = {
  personalizacao: 'Básico',
  estoque: 'Básico',
  fidelidade: 'Básico',
  financeiro: 'Básico',
  relatorios: 'Básico',
  relatorios_avancados: 'Essencial',
  cupons: 'Essencial',
  clientes_crm: 'Essencial',
}

/**
 * Envolve um recurso pago: mostra o conteúdo quando o plano libera a feature,
 * ou uma mensagem genérica de upgrade quando não. A regra real vive no backend
 * (getPlan devolve o mapa de features); aqui é só a camada de UX.
 */
export function FeatureGate({ feature, children }: { feature: PlanFeatureKey; children: ReactNode }) {
  const { data, isPending } = usePlan()

  if (isPending) {
    return (
      <div className="w-full">
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  }

  if (data?.features[feature]) return <>{children}</>

  return <UpgradePrompt plan={FEATURE_MIN_PLAN[feature]} />
}
