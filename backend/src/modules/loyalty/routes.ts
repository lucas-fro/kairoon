import type { FastifyInstance } from 'fastify'
import {
  clientIdParamSchema,
  redeemLoyaltySchema,
  upsertLoyaltyProgramSchema,
} from './schemas'
import * as loyaltyService from './service'

export async function loyaltyRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  app.get('/program', { config: { permission: 'marketing.view' } }, async (request) => {
    return loyaltyService.getProgram(request.user.establishmentId)
  })

  app.put('/program', { config: { permission: 'marketing.manage' } }, async (request) => {
    const input = upsertLoyaltyProgramSchema.parse(request.body)
    return loyaltyService.upsertProgram(request.user.establishmentId, input)
  })

  // Resgatar queima o cartão do cliente e é irreversível, então segue com o
  // marketing, não com quem só fecha a comanda.
  app.post('/redeem', { config: { permission: 'marketing.manage' } }, async (request, reply) => {
    const input = redeemLoyaltySchema.parse(request.body)
    const result = await loyaltyService.redeemLoyalty(request.user.establishmentId, input)
    return reply.status(201).send(result)
  })

  // 'fidelity.lookup' pelo mesmo motivo do /coupons/clients/:clientId: o
  // fechamento mostra os carimbos do cliente. O programa em si segue marketing.
  app.get('/clients/:clientId', { config: { permission: 'fidelity.lookup' } }, async (request) => {
    const { clientId } = clientIdParamSchema.parse(request.params)
    return loyaltyService.getClientLoyalty(request.user.establishmentId, clientId)
  })
}
