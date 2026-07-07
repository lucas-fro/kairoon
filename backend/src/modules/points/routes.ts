import type { FastifyInstance } from 'fastify'
import {
  clientIdParamSchema,
  createPointsRewardSchema,
  idParamSchema,
  redeemPointsSchema,
  updatePointsRewardSchema,
  upsertPointsProgramSchema,
} from './schemas'
import * as pointsService from './service'

export async function pointsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  app.get('/program', async (request) => {
    return pointsService.getProgram(request.user.establishmentId)
  })

  app.put('/program', async (request) => {
    const input = upsertPointsProgramSchema.parse(request.body)
    return pointsService.upsertProgram(request.user.establishmentId, input)
  })

  app.get('/rewards', async (request) => {
    return pointsService.listRewards(request.user.establishmentId)
  })

  app.post('/rewards', async (request, reply) => {
    const input = createPointsRewardSchema.parse(request.body)
    const reward = await pointsService.createReward(request.user.establishmentId, input)
    return reply.status(201).send(reward)
  })

  app.put('/rewards/:id', async (request) => {
    const { id } = idParamSchema.parse(request.params)
    const input = updatePointsRewardSchema.parse(request.body)
    return pointsService.updateReward(request.user.establishmentId, id, input)
  })

  app.delete('/rewards/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    await pointsService.deleteReward(request.user.establishmentId, id)
    return reply.status(204).send()
  })

  app.post('/redeem', async (request, reply) => {
    const input = redeemPointsSchema.parse(request.body)
    const result = await pointsService.redeemPoints(request.user.establishmentId, input)
    return reply.status(201).send(result)
  })

  app.get('/clients/:clientId', async (request) => {
    const { clientId } = clientIdParamSchema.parse(request.params)
    return pointsService.getClientPoints(request.user.establishmentId, clientId)
  })
}
