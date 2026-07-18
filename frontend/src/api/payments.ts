import type { BillingCycle, PlanCatalog, PlanSlug, Subscription, SubscriptionDetails } from '../types/api'
import { api } from './client'

export interface SubscribePayload {
  planSlug: PlanSlug
  billingCycle: BillingCycle
  card: {
    holderName: string
    number: string
    expiryMonth: string
    expiryYear: string
    ccv: string
  }
  holder: {
    name: string
    email: string
    cpfCnpj: string
    postalCode: string
    addressNumber: string
    phone: string
  }
}

export function getPlans() {
  return api<PlanCatalog>('/payments/plans', { auth: false })
}

export function subscribe(payload: SubscribePayload) {
  return api<Subscription>('/payments/subscribe', { method: 'POST', body: payload })
}

export function getSubscription() {
  return api<SubscriptionDetails>('/payments/subscription')
}

export function cancelSubscription() {
  return api<{ ok: true }>('/payments/cancel', { method: 'POST' })
}
