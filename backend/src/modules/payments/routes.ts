import { timingSafeEqual } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { env } from '../../env'
import { PLANS } from '../../lib/plans'
import { changePlanSchema, subscribeSchema, webhookSchema } from './schemas'
import * as paymentsService from './service'

/** Comparação em tempo constante: evita timing attack no token do webhook. */
function isValidWebhookToken(received: string | undefined): boolean {
  if (!received) return false
  const expected = Buffer.from(env.ASAAS_WEBHOOK_TOKEN)
  const actual = Buffer.from(received)
  if (expected.length !== actual.length) return false
  return timingSafeEqual(expected, actual)
}

/**
 * Assinatura e cobrança. Fora o catálogo de planos e o webhook, tudo aqui é
 * 'owner': o cartão e a fatura são do dono, e nem o switch `admin` alcança
 * (ver lib/permissions.ts).
 */
export async function paymentsRoutes(app: FastifyInstance) {
  // Catálogo estático de planos, sem nada da conta: é lido pela tela de preços
  // antes mesmo de existir sessão, por isso 'public' e não 'owner'.
  app.get('/plans', { config: { permission: 'public' } }, async () => PLANS)

  // Rate limit: superfície sensível a fraude/abuso de tentativas de cartão.
  app.post(
    '/subscribe',
    {
      preHandler: [app.authenticate],
      // allowWhenReadOnly: assinar é justamente como o dono sai do somente-leitura.
      config: {
        permission: 'owner',
        rateLimit: { max: 5, timeWindow: '10 minutes' },
        allowWhenReadOnly: true,
      },
    },
    async (request, reply) => {
      const input = subscribeSchema.parse(request.body)
      const subscription = await paymentsService.subscribe(
        request.user.establishmentId,
        request.ip,
        input,
      )
      return reply.status(201).send(subscription)
    },
  )

  app.get(
    '/subscription',
    { preHandler: [app.authenticate], config: { permission: 'owner' } },
    async (request) => {
      return paymentsService.getSubscription(request.user.establishmentId)
    },
  )

  // Troca de plano reaproveitando o cartão já tokenizado no Asaas (sem coletar
  // cartão de novo). Rate limit modesto: não coleta cartão, mas mexe em cobrança.
  app.post(
    '/change-plan',
    {
      preHandler: [app.authenticate],
      config: {
        permission: 'owner',
        rateLimit: { max: 10, timeWindow: '10 minutes' },
        allowWhenReadOnly: true,
      },
    },
    async (request) => {
      const input = changePlanSchema.parse(request.body)
      return paymentsService.changePlan(request.user.establishmentId, input)
    },
  )

  // Cartão cadastrado (últimos 4 + bandeira) pra confirmação da troca de plano.
  app.get(
    '/payment-method',
    { preHandler: [app.authenticate], config: { permission: 'owner' } },
    async (request) => {
      return paymentsService.getPaymentMethod(request.user.establishmentId)
    },
  )

  app.post(
    '/cancel',
    { preHandler: [app.authenticate], config: { permission: 'owner', allowWhenReadOnly: true } },
    async (request) => {
      return paymentsService.cancel(request.user.establishmentId)
    },
  )

  // Público (o Asaas não manda JWT), autenticado pelo header próprio abaixo.
  app.post(
    '/webhook',
    { config: { permission: 'public', rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const token = request.headers['asaas-access-token']
      if (!isValidWebhookToken(typeof token === 'string' ? token : undefined)) {
        return reply.status(401).send({ message: 'Token inválido' })
      }
      const { event, payment } = webhookSchema.parse(request.body)
      await paymentsService.handleWebhook(event, payment)
      return reply.status(200).send({ received: true })
    },
  )
}
