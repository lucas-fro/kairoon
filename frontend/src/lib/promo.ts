import type { BillingCycle, PaymentRecord, Subscription } from '../types/api'
import { hasActiveSubscription } from './subscription'

/**
 * Regras da campanha promocional no lado da tela. Ficam aqui porque o banner do
 * diálogo de upgrade e o campo de cupom do checkout precisam concordar: se as
 * duas telas divergirem, uma anuncia desconto que a outra não aplica.
 *
 * O desconto em si é decidido pelo backend (modules/payments/service.ts); o que
 * está aqui existe para exibir o preço certo e para não deixar o usuário chegar
 * ao gateway com um cupom que vai ser recusado.
 */

/**
 * Fim do dia local, que é o prazo da campanha. Recalcule a cada tick em vez de
 * guardar o alvo: assim o contador atravessa a virada do dia, o notebook
 * dormindo e o horário de verão sem congelar em zero.
 */
export function endOfLocalDay(): Date {
  const end = new Date()
  end.setHours(24, 0, 0, 0)
  return end
}

/** Milissegundos restantes → 'XXh:XXm:XXs'. Nunca fica negativo. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(total / 3600))}h:${pad(Math.floor((total % 3600) / 60))}m:${pad(total % 60)}s`
}

/**
 * Espelha applyPromoCents do backend (lib/promos.ts). Em CENTAVOS: arredondar
 * em reais deixaria fração de centavo no valor exibido.
 */
export function applyPromoCents(cents: number, percentOff: number): number {
  return Math.round((cents * (100 - percentOff)) / 100)
}

/**
 * A conta pode usar o cupom? Espelha resolvePromoForSubscribe do backend.
 *
 * Duas condições. `hasActiveSubscription` barra a troca de plano, que não é
 * boas-vindas. E o histórico de pagamentos barra quem já pagou alguma vez:
 * sem isso, cancelar e reassinar renovaria o desconto para sempre. Repare que
 * conta cancelada NÃO é suficiente para liberar, porque o cancelamento preserva
 * o período pago e a linha da assinatura continua lá.
 */
export function isPromoEligible(
  subscription: Subscription | null,
  payments: PaymentRecord[] | undefined,
): boolean {
  if (hasActiveSubscription(subscription)) return false
  return !(payments ?? []).some((p) => p.status === 'confirmed' || p.status === 'received')
}

/**
 * Onde o desconto incide, que muda por ciclo: no mensal ele vale só na primeira
 * cobrança (os meses seguintes voltam ao cheio), no anual vale no ano inteiro
 * contratado. Texto usado no banner e no resumo do checkout.
 */
export function promoScopeLabel(billingCycle: BillingCycle): string {
  return billingCycle === 'yearly' ? 'no valor total do primeiro ano' : 'no primeiro mês'
}
