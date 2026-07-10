import type { ClientLoyaltySummary, Coupon, LoyaltyProgram, LoyaltyRewardType } from '../types/api'
import { api } from './client'

export interface LoyaltyProgramPayload {
  active: boolean
  stampsRequired: number
  minTicketCents: number
  rewardType: LoyaltyRewardType
  rewardValue?: number
  rewardServiceIds?: string[] | null
}

export function getLoyaltyProgram() {
  return api<LoyaltyProgram | null>('/loyalty/program')
}

export function saveLoyaltyProgram(data: LoyaltyProgramPayload) {
  return api<LoyaltyProgram>('/loyalty/program', { method: 'PUT', body: data })
}

export function getClientLoyalty(clientId: string) {
  return api<ClientLoyaltySummary>(`/loyalty/clients/${clientId}`)
}

/** Consome os carimbos e cunha o cupom pessoal da recompensa */
export function redeemLoyalty(clientId: string) {
  return api<{ coupon: Coupon }>('/loyalty/redeem', { method: 'POST', body: { clientId } })
}
