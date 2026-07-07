import type {
  ClientPointsSummary,
  Coupon,
  CouponDiscountType,
  PointsProgram,
  PointsReward,
} from '../types/api'
import { api } from './client'

export interface PointsProgramPayload {
  active: boolean
  pointsPerService: number
  pointsPerCurrencyUnit: number
}

export interface PointsRewardPayload {
  name: string
  costPoints: number
  rewardType: CouponDiscountType
  rewardValue?: number
  rewardServiceId?: string | null
  active?: boolean
}

export function getPointsProgram() {
  return api<PointsProgram | null>('/points/program')
}

export function savePointsProgram(data: PointsProgramPayload) {
  return api<PointsProgram>('/points/program', { method: 'PUT', body: data })
}

export function listPointsRewards() {
  return api<PointsReward[]>('/points/rewards')
}

export function createPointsReward(data: PointsRewardPayload) {
  return api<PointsReward>('/points/rewards', { method: 'POST', body: data })
}

export function updatePointsReward(id: string, data: PointsRewardPayload) {
  return api<PointsReward>(`/points/rewards/${id}`, { method: 'PUT', body: data })
}

export function deletePointsReward(id: string) {
  return api<void>(`/points/rewards/${id}`, { method: 'DELETE' })
}

export function getClientPoints(clientId: string) {
  return api<ClientPointsSummary>(`/points/clients/${clientId}`)
}

/** Debita os pontos e cunha o cupom pessoal da recompensa */
export function redeemPoints(clientId: string, rewardId: string) {
  return api<{ coupon: Coupon; balance: number }>('/points/redeem', {
    method: 'POST',
    body: { clientId, rewardId },
  })
}
