import { eq } from 'drizzle-orm'
import { db } from '../db'
import { establishments, subscriptions } from '../db/schema'
import { AppError } from './errors'
import { minPlanNameForFeature, planHasFeature, type PlanFeature } from './plans'

/** Dias de teste grátis (sem cartão) concedidos no cadastro. */
export const TRIAL_DAYS = 14

/** Plano efetivo durante o teste grátis: tudo liberado. */
export const TRIAL_PLAN = 'essencial'

/**
 * Não existe estado gratuito permanente: ou a conta tem assinatura paga, ou está
 * no teste, ou o teste acabou e ela é somente-leitura. A coluna
 * `establishments.plan` ainda usa 'free' como valor de rebaixamento, mas isso
 * não é um plano utilizável: é a ausência de um.
 */
export type AccessState = 'paid' | 'trial' | 'trial_expired'

export interface AccountAccess {
  /** Plano efetivo para gating de features/limites (leitura). */
  plan: string
  /** Pode criar/editar? false quando o teste acabou e não há assinatura paga. */
  canWrite: boolean
  state: AccessState
  trialEndsAt: Date | null
  /** Dias inteiros restantes do teste (arredondado pra cima); null fora do teste. */
  trialDaysLeft: number | null
}

/** Subconjunto do estabelecimento necessário para avaliar acesso. */
type EstablishmentAccessRow = { id: string; plan: string; trialEndsAt: Date | null }

/**
 * Avalia SÓ o plano pago vindo de assinatura (mesma lógica/efeitos colaterais de
 * antes): devolve o plano pago ativo ou 'free'. Faz o downgrade preguiçoso quando
 * a assinatura venceu (tolerância estourada) ou foi cancelada e o período já
 * acabou, mantendo os call-sites lendo só a coluna `plan`.
 */
async function evaluatePaidPlan(est: EstablishmentAccessRow): Promise<string> {
  if (est.plan === 'free') return 'free'

  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.establishmentId, est.id),
  })
  if (!subscription) return est.plan

  const now = new Date()
  const graceExpired =
    subscription.status === 'past_due' && !!subscription.graceUntil && subscription.graceUntil < now
  const canceledPeriodEnded =
    subscription.status === 'canceled' &&
    !!subscription.currentPeriodEnd &&
    subscription.currentPeriodEnd < now
  // Parcelamento anual não renova sozinho: quando o ano pago vence, o acesso
  // acaba (a assinatura recorrente, ao contrário, seguiria cobrando o ciclo).
  const installmentTermEnded =
    !!subscription.asaasInstallmentId &&
    subscription.status === 'active' &&
    !!subscription.currentPeriodEnd &&
    subscription.currentPeriodEnd < now

  if (graceExpired || canceledPeriodEnded || installmentTermEnded) {
    await db.transaction(async (tx) => {
      await tx.update(establishments).set({ plan: 'free' }).where(eq(establishments.id, est.id))
      // Fecha o registro quando o motivo é atraso vencido ou fim do parcelamento
      // (o cancelamento manual já chega com status 'canceled').
      if (graceExpired || installmentTermEnded) {
        await tx
          .update(subscriptions)
          .set({ status: 'canceled', canceledAt: now, graceUntil: null, updatedAt: now })
          .where(eq(subscriptions.id, subscription.id))
      }
    })
    return 'free'
  }

  return est.plan
}

/** Dias inteiros (arredondado pra cima) entre agora e uma data futura. */
function daysUntil(date: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86_400_000))
}

/**
 * Estado de acesso da conta: fonte ÚNICA da verdade do plano efetivo E da
 * permissão de escrita. Ordem de prioridade:
 *   1. Assinatura paga ativa → plano pago, gravável.
 *   2. Teste grátis em andamento → plano de teste (essencial), gravável.
 *   3. Teste grátis expirado, ausente (trialEndsAt null) ou assinatura encerrada
 *      → somente-leitura. O plano efetivo segue alto SÓ para leitura (ver
 *      dados/relatórios); a escrita é barrada globalmente pelo hook em app.ts.
 *
 * `preloaded` evita uma query extra quando o chamador já carregou o
 * estabelecimento (ex.: página pública).
 */
export async function getAccessState(
  establishmentId: string,
  preloaded?: EstablishmentAccessRow,
): Promise<AccountAccess> {
  const est =
    preloaded ??
    (await db.query.establishments.findFirst({
      columns: { id: true, plan: true, trialEndsAt: true },
      where: eq(establishments.id, establishmentId),
    }))
  if (!est) throw new AppError('Estabelecimento não encontrado', 404)

  const paidPlan = await evaluatePaidPlan(est)
  if (paidPlan !== 'free') {
    return { plan: paidPlan, canWrite: true, state: 'paid', trialEndsAt: est.trialEndsAt, trialDaysLeft: null }
  }

  // trialEndsAt null (conta anterior à 0030, ou linha criada fora do cadastro)
  // NÃO ganha acesso gratuito vitalício: vale a mesma regra de teste vencido. A
  // migration 0036 preencheu as linhas existentes; isto cobre o resto.
  if (est.trialEndsAt !== null && Date.now() < est.trialEndsAt.getTime()) {
    return {
      plan: TRIAL_PLAN,
      canWrite: true,
      state: 'trial',
      trialEndsAt: est.trialEndsAt,
      trialDaysLeft: daysUntil(est.trialEndsAt),
    }
  }

  return {
    plan: TRIAL_PLAN,
    canWrite: false,
    state: 'trial_expired',
    trialEndsAt: est.trialEndsAt,
    trialDaysLeft: 0,
  }
}

/**
 * Reavaliação "preguiçosa" (sem cron) do plano efetivo: a coluna
 * `establishments.plan` continua sendo lida pelo resto do código; aqui só
 * resolvemos o plano efetivo (delegando ao motor de acesso).
 */
export async function getEffectivePlan(establishmentId: string): Promise<string> {
  return (await getAccessState(establishmentId)).plan
}

export async function assertPaidPlan(establishmentId: string) {
  const plan = await getEffectivePlan(establishmentId)
  if (plan === 'free') {
    throw new AppError('Disponível em um plano pago', 403)
  }
}

/**
 * Garante que o plano efetivo do estabelecimento libera um recurso específico.
 * A regra de qual plano tem o quê vive em lib/plans.ts (PLAN_TIERS).
 */
export async function assertFeature(establishmentId: string, feature: PlanFeature) {
  const plan = await getEffectivePlan(establishmentId)
  if (!planHasFeature(plan, feature)) {
    throw new AppError(`Disponível a partir do plano ${minPlanNameForFeature(feature)}`, 403)
  }
}
