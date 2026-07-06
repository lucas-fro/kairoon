import type { FastifyInstance } from 'fastify'
import {
  createWaitlistSchema,
  idParamSchema,
  listWaitlistQuerySchema,
  promoteWaitlistSchema,
} from './schemas'
import * as waitlistService from './service'

export async function waitlistRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  app.get('/', async (request) => {
    const query = listWaitlistQuerySchema.parse(request.query)
    return waitlistService.listWaitlist(request.user.establishmentId, query)
  })

  app.post('/', async (request, reply) => {
    const input = createWaitlistSchema.parse(request.body)
    const entry = await waitlistService.createWaitlistEntry(request.user.establishmentId, input)
    return reply.status(201).send(entry)
  })

  app.post('/:id/promote', async (request) => {
    const { id } = idParamSchema.parse(request.params)
    const input = promoteWaitlistSchema.parse(request.body)
    return waitlistService.promoteWaitlistEntry(request.user.establishmentId, id, input)
  })

  app.delete('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    await waitlistService.deleteWaitlistEntry(request.user.establishmentId, id)
    return reply.status(204).send()
  })
}
