import { desc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { establishments, payments, subscriptions, users } from '../../db/schema'
import {
  cancelAsaasSubscription,
  createCreditCardInstallment,
  createCreditCardSubscription,
  findOrCreateCustomer,
  getAsaasSubscriptionCard,
  updateAsaasSubscription,
} from '../../lib/asaasClient'
import { AppError } from '../../lib/errors'
import { sendPaymentReceiptEmail } from '../../lib/mailer'
import {
  MAX_INSTALLMENTS,
  PLANS,
  addBillingCycle,
  centsToReais,
  getPlanCycleCents,
  type PlanSlug,
} from '../../lib/plans'
import type { ChangePlanInput, SubscribeInput, WebhookInput } from './schemas'

/** Dias de tolerância após um PAYMENT_OVERDUE antes do downgrade pro free. */
const GRACE_DAYS = 5

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

  const now = new Date()

  // Parcelamento anual em aberto não pode ser trocado no meio do período: as
  // parcelas já foram comprometidas no cartão e seguem sendo cobradas mesmo
  // após cancelamento/atraso (não dá pra cancelá-las de forma simples). Bloqueia
  // ENQUANTO o período pago não vencer (independentemente do status), pra evitar
  // cobrança duplicada (parcelas antigas + a nova).
  if (
    existing?.asaasInstallmentId &&
    existing.currentPeriodEnd &&
    existing.currentPeriodEnd > now
  ) {
    throw new AppError(
      'Você já tem um plano anual parcelado ativo. A troca de plano ficará disponível ao fim do período pago.',
      409,
    )
  }

  const isChange = !!existing && existing.status !== 'canceled'

  const customer = await findOrCreateCustomer({
    name: input.holder.name,
    email: input.holder.email,
    cpfCnpj: input.holder.cpfCnpj,
    phone: input.holder.phone,
  })

  // Só uma assinatura recorrente anterior precisa ser cancelada no Asaas ao
  // trocar (parcelamento não tem assinatura). Cancelamos DEPOIS de criar a nova.
  const previousAsaasSubscriptionId =
    isChange && existing?.asaasSubscriptionId ? existing.asaasSubscriptionId : null

  // Parcelamento só existe no anual (2–12x); no mensal é sempre à vista.
  const useInstallments = input.billingCycle === 'yearly' && (input.installments ?? 1) >= 2

  let values: typeof subscriptions.$inferInsert

  if (useInstallments) {
    // ---- Anual parcelado: cobrança avulsa parcelada no cartão ----
    const installmentCount = Math.min(input.installments ?? 1, MAX_INSTALLMENTS)
    const totalValue = centsToReais(getPlanCycleCents(input.planSlug, 'yearly'))
    // A captura no cartão é IMEDIATA (o Asaas cobra a 1ª parcela hoje mesmo,
    // independentemente do dueDate); por isso o parcelado não tem teste grátis
    // diferido: o dueDate abaixo é só informativo.
    const dueDate = now.toISOString().slice(0, 10)

    const charge = await createCreditCardInstallment({
      customer: customer.id,
      installmentCount,
      totalValue,
      dueDate,
      creditCard: input.card,
      creditCardHolderInfo: input.holder,
      remoteIp,
    })

    values = {
      establishmentId,
      planSlug: input.planSlug,
      billingCycle: 'yearly',
      status: 'active',
      asaasCustomerId: customer.id,
      asaasSubscriptionId: null,
      asaasInstallmentId: charge.installment,
      installments: installmentCount,
      // Acesso pago por 1 ano a partir de hoje; parcelamento não renova sozinho
      // (getEffectivePlan rebaixa pro free quando este prazo vence).
      currentPeriodEnd: addBillingCycle(now, 'yearly'),
      graceUntil: null,
      canceledAt: null,
      updatedAt: now,
    }
  } else {
    // ---- Assinatura recorrente (mensal ou anual à vista) ----
    const cycle = input.billingCycle === 'yearly' ? 'YEARLY' : 'MONTHLY'
    const value = centsToReais(getPlanCycleCents(input.planSlug, input.billingCycle))

    // Data da 1ª cobrança:
    // - Troca de plano: cobra já no ciclo atual (hoje).
    // - Assinatura nova durante o teste grátis: alinha ao fim do teste
    //   (`trialEndsAt`), reaproveita os dias que faltam, sem duplicar cortesia.
    // - Teste já expirado (ou sem `trialEndsAt`, que o motor de acesso trata do
    //   mesmo jeito): cobra hoje para reativar a conta. Conceder 14 dias de
    //   cortesia aqui daria acesso grátis a quem já está em somente-leitura.
    let firstDue: Date
    if (isChange) {
      firstDue = new Date()
    } else {
      const establishment = await db.query.establishments.findFirst({
        columns: { trialEndsAt: true },
        where: eq(establishments.id, establishmentId),
      })
      firstDue =
        establishment?.trialEndsAt && establishment.trialEndsAt > now
          ? establishment.trialEndsAt
          : new Date()
    }
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

    values = {
      establishmentId,
      planSlug: input.planSlug,
      billingCycle: input.billingCycle,
      status: 'active',
      asaasCustomerId: customer.id,
      asaasSubscriptionId: asaasSubscription.id,
      asaasInstallmentId: null,
      installments: null,
      // Fim do período atual = data da 1ª cobrança que enviamos (fim do trial em
      // assinatura nova, ou hoje na troca). Não usamos o nextDueDate devolvido
      // pelo Asaas porque ele já vem avançado 1 ciclo além da 1ª cobrança.
      currentPeriodEnd: new Date(nextDueDate),
      graceUntil: null,
      canceledAt: null,
      updatedAt: new Date(),
    }
  }

  // Nova cobrança criada com sucesso: se era troca de uma assinatura recorrente,
  // cancela a anterior no Asaas pra parar o plano antigo (best-effort).
  if (previousAsaasSubscriptionId) {
    try {
      await cancelAsaasSubscription(previousAsaasSubscriptionId)
    } catch (err) {
      console.error('[payments] falha ao cancelar assinatura anterior na troca:', err)
    }
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

  // Assinatura recorrente: cancela no Asaas pra parar as próximas cobranças.
  // Parcelamento (sem asaasSubscriptionId): as parcelas já foram compradas e
  // seguem sendo cobradas. Aqui só marcamos como cancelado localmente.
  if (subscription.asaasSubscriptionId) {
    await cancelAsaasSubscription(subscription.asaasSubscriptionId)
  }

  // Mantém currentPeriodEnd como está: o acesso pago continua até o fim do
  // período já pago (getEffectivePlan reavalia isso preguiçosamente).
  await db
    .update(subscriptions)
    .set({ status: 'canceled', canceledAt: new Date(), updatedAt: new Date() })
    .where(eq(subscriptions.id, subscription.id))

  return { ok: true as const }
}

/**
 * Troca o plano/ciclo reaproveitando o cartão que o Asaas já mantém tokenizado
 * na assinatura, sem pedir os dados do cartão de novo. Só rola quando já existe
 * uma assinatura viva (não cancelada): atualizamos valor e ciclo na assinatura
 * existente do Asaas e liberamos o novo plano na hora. O novo valor passa a
 * valer nas próximas cobranças (a data da próxima cobrança não muda), então não
 * há cobrança imediata pela diferença.
 *
 * Sem assinatura (ou cancelada) não dá pra reaproveitar cartão nenhum: o fluxo
 * cai no checkout normal (subscribe), que coleta o cartão.
 */
export async function changePlan(establishmentId: string, input: ChangePlanInput) {
  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.establishmentId, establishmentId),
  })
  if (!subscription || subscription.status === 'canceled') {
    throw new AppError('Nenhuma assinatura ativa para alterar. Faça uma nova assinatura.', 409)
  }
  // Parcelamento não é assinatura tokenizada no Asaas: não dá pra ajustar
  // valor/ciclo sem uma nova cobrança: a troca só rola ao fim do período.
  if (!subscription.asaasSubscriptionId) {
    throw new AppError(
      'Seu plano anual parcelado não pode ser alterado por aqui. A troca ficará disponível ao fim do período pago.',
      409,
    )
  }
  if (subscription.planSlug === input.planSlug && subscription.billingCycle === input.billingCycle) {
    throw new AppError('Você já está neste plano.', 422)
  }

  const cycle = input.billingCycle === 'yearly' ? 'YEARLY' : 'MONTHLY'
  const value = centsToReais(getPlanCycleCents(input.planSlug, input.billingCycle))

  await updateAsaasSubscription(subscription.asaasSubscriptionId, { value, cycle })

  const [updated] = await db
    .update(subscriptions)
    .set({
      planSlug: input.planSlug,
      billingCycle: input.billingCycle,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, subscription.id))
    .returning()

  // Libera o novo plano imediatamente (o gating lê establishments.plan).
  await db
    .update(establishments)
    .set({ plan: input.planSlug })
    .where(eq(establishments.id, establishmentId))

  return updated
}

/**
 * Cartão já cadastrado na assinatura ativa (últimos 4 + bandeira), só pra mostrar
 * na confirmação de troca de plano. Best-effort: sem assinatura viva, ou se o
 * Asaas falhar, devolve null e a UI cai num texto genérico.
 */
export async function getPaymentMethod(establishmentId: string) {
  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.establishmentId, establishmentId),
  })
  if (!subscription || subscription.status === 'canceled') return null
  // Parcelamento não expõe cartão tokenizado de assinatura.
  if (!subscription.asaasSubscriptionId) return null
  try {
    return await getAsaasSubscriptionCard(subscription.asaasSubscriptionId)
  } catch (err) {
    console.error('[payments] falha ao buscar cartão da assinatura:', err)
    return null
  }
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
  if (!payment) return
  // Casamos o pagamento pela assinatura recorrente OU pelo grupo de parcelamento.
  // Sem nenhum dos dois, é cobrança de outro fluxo: ignora.
  const where = payment.subscription
    ? eq(subscriptions.asaasSubscriptionId, payment.subscription)
    : payment.installment
      ? eq(subscriptions.asaasInstallmentId, payment.installment)
      : null
  if (!where) return

  const subscription = await db.query.subscriptions.findFirst({ where })
  if (!subscription) {
    // Sem registro local casando: pode ser uma corrida (o INSERT do subscribe
    // ainda não commitou) ou uma cobrança órfã (ex.: charge criado no Asaas mas
    // o INSERT falhou depois). NÃO devolvemos erro: o Asaas PAUSA a fila inteira
    // de webhooks em qualquer não-2xx, e uma órfã permanente travaria a conta
    // toda pra sempre. O acesso já é liberado no próprio subscribe (o webhook é
    // só confirmatório), então descartamos com log pra reconciliação manual.
    console.warn(
      '[payments] webhook sem assinatura local (ignorado):',
      JSON.stringify({
        event,
        paymentId: payment.id,
        subscription: payment.subscription,
        installment: payment.installment,
      }),
    )
    return
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

  const isInstallment = !!subscription.asaasInstallmentId

  if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
    // NÃO reativa um registro já cancelado (estorno, chargeback ou cancelamento
    // manual). No parcelamento as parcelas seguem caindo mesmo após a revogação
    // e cada uma dispararia este evento: sem esta trava, o acesso pago voltaria
    // sozinho, anulando a revogação. Recuperação de atraso (past_due→active)
    // continua funcionando porque só 'canceled' é terminal aqui.
    if (subscription.status !== 'canceled') {
      const dueDate = payment.dueDate ? new Date(payment.dueDate) : new Date()
      // Assinatura recorrente: cada cobrança confirma um novo ciclo → avança o
      // período. Parcelamento: o prazo é fixo (1 ano, definido na compra), então
      // NÃO avança a cada parcela paga: mantém o currentPeriodEnd original.
      const nextChargeDate = isInstallment
        ? (subscription.currentPeriodEnd ?? addBillingCycle(dueDate, subscription.billingCycle))
        : addBillingCycle(dueDate, subscription.billingCycle)
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
      // No parcelamento pulamos: o Asaas já manda recibo por parcela e o texto de
      // "próxima cobrança" ficaria enganoso (o prazo é fixo, não recorrente).
      if (!wasAlreadyPaid && !isInstallment) {
        void sendPaymentReceipt(subscription, payment, paidAt, nextChargeDate)
      }
    }
  } else if (event === 'PAYMENT_OVERDUE') {
    // Mesma trava do PAYMENT_CONFIRMED/RECEIVED acima: um registro já cancelado
    // é terminal. Sem isto, uma parcela que falha DEPOIS do usuário cancelar
    // reverteria o status de volta pra 'past_due' (regressão de um estado
    // terminal), e mais tarde, ao vencer a graça, plan.ts sobrescreveria
    // canceledAt com a data da graça, apagando a data real do cancelamento.
    if (subscription.status !== 'canceled') {
      const graceUntil = new Date()
      graceUntil.setDate(graceUntil.getDate() + GRACE_DAYS)
      await db
        .update(subscriptions)
        .set({ status: 'past_due', graceUntil, updatedAt: new Date() })
        .where(eq(subscriptions.id, subscription.id))
    }
  } else if (event === 'PAYMENT_REFUNDED' || event === 'PAYMENT_CHARGEBACK_REQUESTED') {
    // Idem: se já está cancelado (ex.: o próprio usuário cancelou antes, ou um
    // reembolso duplicado/reentrega do Asaas), não reprocessa: preserva o
    // canceledAt original e evita cancelar no Asaas duas vezes à toa.
    if (subscription.status !== 'canceled') {
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
      // Só assinatura recorrente tem o que cancelar no Asaas; no parcelamento o
      // estorno/chargeback já reverte a cobrança do lado do gateway.
      if (subscription.asaasSubscriptionId) {
        try {
          await cancelAsaasSubscription(subscription.asaasSubscriptionId)
        } catch (err) {
          console.error('[payments] falha ao cancelar assinatura apos chargeback/estorno:', err)
        }
      }
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
