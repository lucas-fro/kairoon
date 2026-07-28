import type { Subscription } from '../types/api'

/**
 * Derivações de estado da assinatura. Ficam aqui porque duas telas dependem
 * delas (Configurações › Plano e o diálogo de upgrade) e errar qualquer uma
 * custa dinheiro: mandar um assinante pro checkout o cobra de novo, e liberar a
 * troca no meio de um parcelamento cria uma cobrança que o backend recusa.
 */

/**
 * Registro de anual PARCELADO (2–12x): as parcelas já foram compradas de uma
 * vez. É diferente da assinatura recorrente, que renova sozinha a cada ciclo.
 */
export function isInstallmentRecord(subscription: Subscription): boolean {
  return (subscription.installments ?? 0) >= 2
}

/** O período pago ainda está no futuro? (false quando não há data de fim) */
export function isPeriodActive(subscription: Subscription): boolean {
  return (
    !!subscription.currentPeriodEnd && new Date(subscription.currentPeriodEnd).getTime() > Date.now()
  )
}

/**
 * Termo do parcelamento AINDA em aberto (parcelas caindo): troca e cancelamento
 * só ao fim do período pago, espelhando o guard do backend (service.subscribe).
 * Depois que vence (status 'canceled'), o usuário pode assinar de novo normal.
 */
export function isInstallmentTermActive(subscription: Subscription | null): boolean {
  return (
    !!subscription &&
    isInstallmentRecord(subscription) &&
    subscription.status !== 'canceled' &&
    isPeriodActive(subscription)
  )
}

/** Assinatura viva: existe e não foi cancelada. */
export function hasActiveSubscription(subscription: Subscription | null): boolean {
  return !!subscription && subscription.status !== 'canceled'
}

/**
 * Dá pra trocar de plano reaproveitando o cartão já tokenizado no Asaas? Sem
 * isso (sem assinatura, cancelada ou parcelada), a compra passa pelo checkout.
 */
export function canChangeWithSavedCard(subscription: Subscription | null): boolean {
  return !!subscription && hasActiveSubscription(subscription) && !isInstallmentRecord(subscription)
}
