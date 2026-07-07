import type { Coupon, CouponAppliesTo, CouponDiscountType, CouponValidationResult } from '../types/api'
import { api } from './client'

export interface CouponPayload {
  name?: string
  source?: 'manual' | 'campaign'
  code?: string
  discountType: CouponDiscountType
  discountValue?: number
  appliesTo?: CouponAppliesTo
  appliesToServiceIds?: string[]
  minSpendCents?: number
  maxDiscountCents?: number | null
  validFrom?: string | null
  validUntil?: string | null
  maxUses?: number | null
  usesPerClient?: number
  firstVisitOnly?: boolean
  active?: boolean
}

export interface ValidateCouponPayload {
  /** ausente = busca a melhor campanha automática que casa */
  code?: string
  clientId: string
  serviceId: string
  subtotalCents: number
  /** data do atendimento ('YYYY-MM-DD') */
  date: string
  /** exclui o próprio atendimento das contagens (refinalizar) */
  appointmentId?: string
}

export function listCoupons(source?: 'manual' | 'campaign') {
  const query = source ? `?source=${source}` : ''
  return api<Coupon[]>(`/coupons${query}`)
}

export function createCoupon(data: CouponPayload) {
  return api<Coupon>('/coupons', { method: 'POST', body: data })
}

export function updateCoupon(id: string, data: Partial<CouponPayload>) {
  return api<Coupon>(`/coupons/${id}`, { method: 'PUT', body: data })
}

export function deleteCoupon(id: string) {
  return api<void>(`/coupons/${id}`, { method: 'DELETE' })
}

export function validateCoupon(data: ValidateCouponPayload) {
  return api<CouponValidationResult>('/coupons/validate', { method: 'POST', body: data })
}

/** Cupons pessoais disponíveis do cliente (recompensas cunhadas) */
export function listClientCoupons(clientId: string) {
  return api<Coupon[]>(`/coupons/clients/${clientId}`)
}
