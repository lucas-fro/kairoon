import type { FastifyInstance } from 'fastify'
import {
  clientIdParamSchema,
  redeemLoyaltySchema,
  upsertLoyaltyProgramSchema,
} from './schemas'
import * as loyaltyService from './service'

export async function loyaltyRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  app.get('/program', async (request) => {
    return loyaltyService.getProgram(request.user.establishmentId)
  })

  app.put('/program', async (request) => {
    const input = upsertLoyaltyProgramSchema.parse(request.body)
    return loyaltyService.upsertProgram(request.user.establishmentId, input)
  })

  app.post('/redeem', async (request, reply) => {
    const input = redeemLoyaltySchema.parse(request.body)
    const result = await loyaltyService.redeemLoyalty(request.user.establishmentId, input)
    return reply.status(201).send(result)
  })

  app.get('/clients/:clientId', async (request) => {
    const { clientId } = clientIdParamSchema.parse(request.params)
    return loyaltyService.getClientLoyalty(request.user.establishmentId, clientId)
  })
}
