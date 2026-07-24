import type { BillingCycle, PlanCatalog, PlanSlug, Subscription, SubscriptionDetails } from '../types/api'
import { api } from './client'

export interface SubscribePayload {
  planSlug: PlanSlug
  billingCycle: BillingCycle
  /** Parcelas do cartão (2–12) — só vale no anual; 1/ausente = à vista. */
  installments?: number
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

export interface ChangePlanPayload {
  planSlug: PlanSlug
  billingCycle: BillingCycle
}

/** Troca de plano reaproveitando o cartão já tokenizado no Asaas (sem checkout). */
export function changePlan(payload: ChangePlanPayload) {
  return api<Subscription>('/payments/change-plan', { method: 'POST', body: payload })
}

export interface PaymentMethod {
  /** Últimos 4 dígitos do cartão cadastrado. */
  last4: string
  /** Bandeira do cartão (ex.: "MASTERCARD"); pode vir vazia. */
  brand: string
}

/** Cartão cadastrado na assinatura ativa (null se não houver ou o gateway falhar). */
export function getPaymentMethod() {
  return api<PaymentMethod | null>('/payments/payment-method')
}

export function cancelSubscription() {
  return api<{ ok: true }>('/payments/cancel', { method: 'POST' })
}
