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

  app.get('/program', { config: { permission: 'marketing.view' } }, async (request) => {
    return pointsService.getProgram(request.user.establishmentId)
  })

  app.put('/program', { config: { permission: 'marketing.manage' } }, async (request) => {
    const input = upsertPointsProgramSchema.parse(request.body)
    return pointsService.upsertProgram(request.user.establishmentId, input)
  })

  app.get('/rewards', { config: { permission: 'marketing.view' } }, async (request) => {
    return pointsService.listRewards(request.user.establishmentId)
  })

  app.post('/rewards', { config: { permission: 'marketing.manage' } }, async (request, reply) => {
    const input = createPointsRewardSchema.parse(request.body)
    const reward = await pointsService.createReward(request.user.establishmentId, input)
    return reply.status(201).send(reward)
  })

  app.put('/rewards/:id', { config: { permission: 'marketing.manage' } }, async (request) => {
    const { id } = idParamSchema.parse(request.params)
    const input = updatePointsRewardSchema.parse(request.body)
    return pointsService.updateReward(request.user.establishmentId, id, input)
  })

  app.delete('/rewards/:id', { config: { permission: 'marketing.manage' } }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    await pointsService.deleteReward(request.user.establishmentId, id)
    return reply.status(204).send()
  })

  // Resgatar debita o saldo de pontos do cliente e não tem desfazer, então fica
  // com o marketing, não com quem só fecha a comanda.
  app.post('/redeem', { config: { permission: 'marketing.manage' } }, async (request, reply) => {
    const input = redeemPointsSchema.parse(request.body)
    const result = await pointsService.redeemPoints(request.user.establishmentId, input)
    return reply.status(201).send(result)
  })

  // 'fidelity.lookup' pelo mesmo motivo do /coupons/clients/:clientId: o
  // fechamento mostra o saldo do cliente. O programa e as recompensas em si
  // seguem marketing.
  app.get('/clients/:clientId', { config: { permission: 'fidelity.lookup' } }, async (request) => {
    const { clientId } = clientIdParamSchema.parse(request.params)
    return pointsService.getClientPoints(request.user.establishmentId, clientId)
  })
}
