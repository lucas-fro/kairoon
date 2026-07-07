import { eq } from 'drizzle-orm'
import { db } from '../db'
import { establishments } from '../db/schema'
import { AppError } from './errors'

/**
 * Gate de plano dos módulos de marketing (cupons/campanhas/fidelidade/pontos).
 * Nasce DESLIGADO: os recursos valem para todos os planos. Quando a cobrança
 * existir, trocar para true — todo create/update dos módulos já chama
 * assertPaidPlan condicionado a esta constante.
 */
export const MARKETING_REQUIRES_PRO = false

export async function assertPaidPlan(establishmentId: string) {
  const establishment = await db.query.establishments.findFirst({
    columns: { plan: true },
    where: eq(establishments.id, establishmentId),
  })
  if (!establishment) throw new AppError('Estabelecimento não encontrado', 404)
  if (establishment.plan === 'free') {
    throw new AppError('Disponível no plano Pro', 403)
  }
}
