import { useQuery } from '@tanstack/react-query'
import { getPlan } from '../api/establishment'
import type { PlanFeatureKey } from '../types/api'

/** Plano efetivo + features/limites do estabelecimento (cacheado por react-query). */
export function usePlan() {
  return useQuery({ queryKey: ['plan'], queryFn: getPlan })
}

/** Conveniência: o recurso está liberado no plano atual? (undefined enquanto carrega) */
export function useFeature(feature: PlanFeatureKey): { allowed: boolean; isPending: boolean } {
  const { data, isPending } = usePlan()
  return { allowed: data?.features[feature] ?? false, isPending }
}

/**
 * A conta pode criar/editar? `false` só quando o teste grátis acabou sem
 * assinatura (somente-leitura). Otimista enquanto carrega: o backend é a
 * garantia real (bloqueia com 402 TRIAL_EXPIRED).
 */
export function useCanWrite(): boolean {
  const { data } = usePlan()
  return data?.canWrite !== false
}
