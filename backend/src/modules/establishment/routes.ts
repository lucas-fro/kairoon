import type { FastifyInstance } from 'fastify'
import {
  createTimeBlockSchema,
  slugAvailabilityQuerySchema,
  timeBlockIdParamSchema,
  updateEstablishmentSchema,
  updateSlugSchema,
  updateWorkingHoursSchema,
} from './schemas'
import * as establishmentService from './service'

export async function establishmentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  app.get('/', async (request) => {
    return establishmentService.getEstablishment(request.user.establishmentId)
  })

  app.put('/', async (request) => {
    const input = updateEstablishmentSchema.parse(request.body)
    return establishmentService.updateEstablishment(request.user.establishmentId, input)
  })

  app.put('/slug', async (request) => {
    const { slug } = updateSlugSchema.parse(request.body)
    return establishmentService.updateSlug(request.user.establishmentId, slug)
  })

  app.get('/slug-availability', async (request) => {
    const { slug } = slugAvailabilityQuerySchema.parse(request.query)
    const available = await establishmentService.checkSlugAvailability(
      request.user.establishmentId,
      slug,
    )
    return { available }
  })

  app.get('/working-hours', async (request) => {
    return establishmentService.listWorkingHours(request.user.establishmentId)
  })

  app.put('/working-hours', async (request) => {
    const input = updateWorkingHoursSchema.parse(request.body)
    return establishmentService.updateWorkingHours(request.user.establishmentId, input)
  })

  app.get('/time-blocks', async (request) => {
    return establishmentService.listTimeBlocks(request.user.establishmentId)
  })

  app.post('/time-blocks', async (request, reply) => {
    const input = createTimeBlockSchema.parse(request.body)
    const block = await establishmentService.createTimeBlock(request.user.establishmentId, input)
    return reply.status(201).send(block)
  })

  app.delete('/time-blocks/:id', async (request, reply) => {
    const { id } = timeBlockIdParamSchema.parse(request.params)
    await establishmentService.deleteTimeBlock(request.user.establishmentId, id)
    return reply.status(204).send()
  })

  app.get('/plan', async (request) => {
    return establishmentService.getPlan(request.user.establishmentId)
  })

  // Exclusão da própria conta (LGPD) continua liberada em somente-leitura.
  app.delete('/', { config: { allowWhenReadOnly: true } }, async (request, reply) => {
    await establishmentService.deleteAccount(request.user.sub)
    return reply.status(204).send()
  })
}
