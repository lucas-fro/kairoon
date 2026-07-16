import { eq } from 'drizzle-orm'
import { db } from '../db'
import { establishments, subscriptions } from '../db/schema'
import { AppError } from './errors'

/**
 * Gate de plano dos módulos de marketing (cupons/campanhas/fidelidade/pontos).
 * Nasce DESLIGADO: os recursos valem para todos os planos. Quando a cobrança
 * existir, trocar para true — todo create/update dos módulos já chama
 * assertPaidPlan condicionado a esta constante.
 */
export const MARKETING_REQUIRES_PRO = false

/**
 * Reavaliação "preguiçosa" (sem cron) do plano efetivo: `establishments.plan`
 * é a fonte da verdade lida pelo resto do código, mas ela só se atualiza
 * quando alguém chama esta função — nos pontos em que o atraso ou o
 * cancelamento já deveriam ter expirado, faz o downgrade aqui mesmo antes de
 * responder. Assim os call-sites de gating continuam lendo só a coluna.
 */
export async function getEffectivePlan(establishmentId: string): Promise<string> {
  const establishment = await db.query.establishments.findFirst({
    columns: { plan: true },
    where: eq(establishments.id, establishmentId),
  })
  if (!establishment) throw new AppError('Estabelecimento não encontrado', 404)
  if (establishment.plan === 'free') return 'free'

  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.establishmentId, establishmentId),
  })
  if (!subscription) return establishment.plan

  const now = new Date()
  const graceExpired = subscription.status === 'past_due' && !!subscription.graceUntil && subscription.graceUntil < now
  const canceledPeriodEnded =
    subscription.status === 'canceled' &&
    !!subscription.currentPeriodEnd &&
    subscription.currentPeriodEnd < now

  if (graceExpired || canceledPeriodEnded) {
    await db.transaction(async (tx) => {
      await tx.update(establishments).set({ plan: 'free' }).where(eq(establishments.id, establishmentId))
      if (graceExpired) {
        await tx
          .update(subscriptions)
          .set({ status: 'canceled', graceUntil: null, updatedAt: now })
          .where(eq(subscriptions.id, subscription.id))
      }
    })
    return 'free'
  }

  return establishment.plan
}

export async function assertPaidPlan(establishmentId: string) {
  const plan = await getEffectivePlan(establishmentId)
  if (plan === 'free') {
    throw new AppError('Disponível no plano Pro', 403)
  }
}
