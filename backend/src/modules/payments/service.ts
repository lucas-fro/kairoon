import { desc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { establishments, payments, subscriptions, users } from '../../db/schema'
import {
  cancelAsaasSubscription,
  createCreditCardSubscription,
  findOrCreateCustomer,
} from '../../lib/asaasClient'
import { AppError } from '../../lib/errors'
import { sendPaymentReceiptEmail } from '../../lib/mailer'
import { PLANS, addBillingCycle, centsToReais, getPlanCycleCents, type PlanSlug } from '../../lib/plans'
import type { SubscribeInput, WebhookInput } from './schemas'

/** Dias de tolerância após um PAYMENT_OVERDUE antes do downgrade pro free. */
const GRACE_DAYS = 5

/** Dias de teste grátis antes da primeira cobrança de uma assinatura nova. */
const TRIAL_DAYS = 14

function isUniqueViolation(err: unknown): boolean {
  const error = err as { code?: string; cause?: { code?: string } }
  return error.code === '23505' || error.cause?.code === '23505'
}

export async function getSubscription(establishmentId: string) {
  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.establishmentId, establishmentId),
  })
  if (!subscription) return { subscription: null, payments: [] }

  const history = await db.query.payments.findMany({
    where: eq(payments.subscriptionId, subscription.id),
    orderBy: [desc(payments.createdAt)],
    limit: 12,
  })

  return { subscription, payments: history }
}

/**
 * Cria (ou troca) a assinatura no Asaas e libera o plano na hora.
 *
 * - Assinatura NOVA: ganha 14 dias grátis (a primeira cobrança é agendada pro
 *   fim do trial) e o plano já fica ativo durante o teste.
 * - TROCA de plano (já existe assinatura não cancelada): cria a nova assinatura,
 *   cancela a anterior no Asaas e passa a cobrar o novo plano. Como o cartão é
 *   coletado de novo no checkout, não dependemos de tokenização.
 *
 * O acesso é liberado de imediato; o webhook PAYMENT_CONFIRMED só mantém o
 * `currentPeriodEnd` em dia e PAYMENT_OVERDUE cuida da inadimplência.
 */
export async function subscribe(establishmentId: string, remoteIp: string, input: SubscribeInput) {
  const existing = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.establishmentId, establishmentId),
  })
  const isChange = !!existing && existing.status !== 'canceled'

  const customer = await findOrCreateCustomer({
    name: input.holder.name,
    email: input.holder.email,
    cpfCnpj: input.holder.cpfCnpj,
    phone: input.holder.phone,
  })

  const cycle = input.billingCycle === 'yearly' ? 'YEARLY' : 'MONTHLY'
  const value = centsToReais(getPlanCycleCents(input.planSlug, input.billingCycle))

  // Nova assinatura começa com trial (1ª cobrança em TRIAL_DAYS dias). Troca de
  // plano cobra o novo valor já no próximo ciclo, sem novo trial.
  const firstDue = new Date()
  if (!isChange) firstDue.setDate(firstDue.getDate() + TRIAL_DAYS)
  const nextDueDate = firstDue.toISOString().slice(0, 10)

  const asaasSubscription = await createCreditCardSubscription({
    customer: customer.id,
    cycle,
    value,
    nextDueDate,
    creditCard: input.card,
    creditCardHolderInfo: input.holder,
    remoteIp,
  })

  // Criou a nova com sucesso: se era troca, cancela a anterior no Asaas pra
  // parar de cobrar o plano antigo (best-effort — não falha a troca por isso).
  if (isChange && existing) {
    try {
      await cancelAsaasSubscription(existing.asaasSubscriptionId)
    } catch (err) {
      console.error('[payments] falha ao cancelar assinatura anterior na troca:', err)
    }
  }

  const values = {
    establishmentId,
    planSlug: input.planSlug,
    billingCycle: input.billingCycle,
    status: 'active' as const,
    asaasCustomerId: customer.id,
    asaasSubscriptionId: asaasSubscription.id,
    // Fim do período atual = data da 1ª cobrança que enviamos (fim do trial em
    // assinatura nova, ou hoje na troca). Não usamos o nextDueDate devolvido
    // pelo Asaas porque ele já vem avançado 1 ciclo além da 1ª cobrança.
    currentPeriodEnd: new Date(nextDueDate),
    graceUntil: null,
    canceledAt: null,
    updatedAt: new Date(),
  }

  try {
    const [subscription] = existing
      ? await db
          .update(subscriptions)
          .set(values)
          .where(eq(subscriptions.id, existing.id))
          .returning()
      : await db.insert(subscriptions).values(values).returning()

    // Libera o plano imediatamente (trial dá acesso na hora; troca aplica o novo).
    await db
      .update(establishments)
      .set({ plan: input.planSlug })
      .where(eq(establishments.id, establishmentId))

    return subscription
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError('Este estabelecimento já possui uma assinatura', 409)
    }
    throw err
  }
}

export async function cancel(establishmentId: string) {
  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.establishmentId, establishmentId),
  })
  if (!subscription || subscription.status === 'canceled') {
    throw new AppError('Nenhuma assinatura ativa encontrada', 404)
  }

  await cancelAsaasSubscription(subscription.asaasSubscriptionId)

  // Mantém currentPeriodEnd como está: o acesso pago continua até o fim do
  // período já pago (getEffectivePlan reavalia isso preguiçosamente).
  await db
    .update(subscriptions)
    .set({ status: 'canceled', canceledAt: new Date(), updatedAt: new Date() })
    .where(eq(subscriptions.id, subscription.id))

  return { ok: true as const }
}

const PAYMENT_STATUS_MAP: Record<string, (typeof payments.$inferSelect)['status']> = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  RECEIVED: 'received',
  RECEIVED_IN_CASH: 'received',
  OVERDUE: 'overdue',
  REFUNDED: 'refunded',
  REFUND_REQUESTED: 'refunded',
  CHARGEBACK_REQUESTED: 'refunded',
  PAYMENT_DELETED: 'failed',
}

export async function handleWebhook(event: string, payment: WebhookInput['payment']) {
  // Eventos que não carregam um pagamento de assinatura (ex.: cobrança avulsa
  // de outro fluxo) não nos interessam aqui.
  if (!payment?.subscription) return

  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.asaasSubscriptionId, payment.subscription),
  })
  if (!subscription) {
    // Corrida entre a resposta do Asaas na criação e o INSERT local (ou
    // assinatura de outra origem). Não descarta silenciosamente: devolve erro
    // pro Asaas reentregar (ele tem retry com backoff).
    throw new AppError('Assinatura local não encontrada para este webhook', 409)
  }

  const mappedStatus = PAYMENT_STATUS_MAP[payment.status ?? ''] ?? 'pending'
  const paidAt = payment.clientPaymentDate ? new Date(payment.clientPaymentDate) : null

  // Este pagamento já constava como pago? Evita enviar dois comprovantes quando
  // CONFIRMED e RECEIVED chegam para a mesma cobrança.
  const existingPayment = await db.query.payments.findFirst({
    where: eq(payments.asaasPaymentId, payment.id),
  })
  const wasAlreadyPaid = existingPayment?.status === 'confirmed' || existingPayment?.status === 'received'

  await db
    .insert(payments)
    .values({
      subscriptionId: subscription.id,
      asaasPaymentId: payment.id,
      status: mappedStatus,
      amountCents: Math.round((payment.value ?? 0) * 100),
      dueDate: payment.dueDate ?? new Date().toISOString().slice(0, 10),
      paidAt,
      invoiceUrl: payment.invoiceUrl,
    })
    .onConflictDoUpdate({
      target: payments.asaasPaymentId,
      set: { status: mappedStatus, paidAt },
    })

  if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
    const dueDate = payment.dueDate ? new Date(payment.dueDate) : new Date()
    const nextChargeDate = addBillingCycle(dueDate, subscription.billingCycle)
    await db
      .update(subscriptions)
      .set({
        status: 'active',
        graceUntil: null,
        currentPeriodEnd: nextChargeDate,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, subscription.id))
    await db
      .update(establishments)
      .set({ plan: subscription.planSlug })
      .where(eq(establishments.id, subscription.establishmentId))

    // Comprovante da Kairoon (além do e-mail que o próprio Asaas dispara).
    // Fire-and-forget: envio de e-mail nunca deve travar nem falhar o webhook.
    if (!wasAlreadyPaid) {
      void sendPaymentReceipt(subscription, payment, paidAt, nextChargeDate)
    }
  } else if (event === 'PAYMENT_OVERDUE') {
    const graceUntil = new Date()
    graceUntil.setDate(graceUntil.getDate() + GRACE_DAYS)
    await db
      .update(subscriptions)
      .set({ status: 'past_due', graceUntil, updatedAt: new Date() })
      .where(eq(subscriptions.id, subscription.id))
  } else if (event === 'PAYMENT_REFUNDED' || event === 'PAYMENT_CHARGEBACK_REQUESTED') {
    // Estorno ou chargeback: revoga o acesso na hora (assinatura cancelada,
    // conta volta pro free) e para de cobrar no Asaas.
    await db
      .update(subscriptions)
      .set({ status: 'canceled', canceledAt: new Date(), updatedAt: new Date() })
      .where(eq(subscriptions.id, subscription.id))
    await db
      .update(establishments)
      .set({ plan: 'free' })
      .where(eq(establishments.id, subscription.establishmentId))
    try {
      await cancelAsaasSubscription(subscription.asaasSubscriptionId)
    } catch (err) {
      console.error('[payments] falha ao cancelar assinatura apos chargeback/estorno:', err)
    }
  }
}

/**
 * Envia o comprovante de pagamento pro dono da conta. Nunca lança: qualquer
 * falha de e-mail é só logada, pra não afetar o processamento do webhook.
 */
async function sendPaymentReceipt(
  subscription: typeof subscriptions.$inferSelect,
  payment: NonNullable<WebhookInput['payment']>,
  paidAt: Date | null,
  nextChargeDate: Date,
) {
  try {
    const establishment = await db.query.establishments.findFirst({
      where: eq(establishments.id, subscription.establishmentId),
    })
    if (!establishment) return
    const owner = await db.query.users.findFirst({ where: eq(users.id, establishment.ownerId) })
    if (!owner) return

    await sendPaymentReceiptEmail({
      to: owner.email,
      name: owner.name,
      planName: PLANS[subscription.planSlug as PlanSlug]?.name ?? subscription.planSlug,
      billingCycle: subscription.billingCycle,
      amountCents: Math.round((payment.value ?? 0) * 100),
      paidAt,
      nextChargeDate,
      invoiceUrl: payment.invoiceUrl ?? null,
    })
  } catch (err) {
    console.error('[payments] falha ao enviar comprovante de pagamento:', err)
  }
}
