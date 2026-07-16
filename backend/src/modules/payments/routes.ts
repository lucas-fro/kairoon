import { timingSafeEqual } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { env } from '../../env'
import { PLANS } from '../../lib/plans'
import { changePlanSchema, subscribeSchema, webhookSchema } from './schemas'
import * as paymentsService from './service'

/** Comparação em tempo constante — evita timing attack no token do webhook. */
function isValidWebhookToken(received: string | undefined): boolean {
  if (!received) return false
  const expected = Buffer.from(env.ASAAS_WEBHOOK_TOKEN)
  const actual = Buffer.from(received)
  if (expected.length !== actual.length) return false
  return timingSafeEqual(expected, actual)
}

export async function paymentsRoutes(app: FastifyInstance) {
  app.get('/plans', async () => PLANS)

  // Rate limit: superfície sensível a fraude/abuso de tentativas de cartão.
  app.post(
    '/subscribe',
    {
      preHandler: [app.authenticate],
      config: { rateLimit: { max: 5, timeWindow: '10 minutes' } },
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

  app.get('/subscription', { preHandler: [app.authenticate] }, async (request) => {
    return paymentsService.getSubscription(request.user.establishmentId)
  })

  app.post('/cancel', { preHandler: [app.authenticate] }, async (request) => {
    return paymentsService.cancel(request.user.establishmentId)
  })

  app.post('/change-plan', { preHandler: [app.authenticate] }, async (request) => {
    const input = changePlanSchema.parse(request.body)
    return paymentsService.changePlan(request.user.establishmentId, input.planSlug, input.billingCycle)
  })

  // Público (o Asaas não manda JWT) — autenticado pelo header próprio abaixo.
  app.post(
    '/webhook',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
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
