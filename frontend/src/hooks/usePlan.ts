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
