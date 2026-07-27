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

  // A fila é um pedaço da agenda (traz nome e telefone do cliente esperando):
  // o serviço a escopa pelo mesmo critério, e encaixar, que cria agendamento,
  // não pode virar atalho para gravar na agenda de um colega.
  app.get('/', { config: { permission: 'agenda.view' } }, async (request) => {
    const query = listWaitlistQuerySchema.parse(request.query)
    return waitlistService.listWaitlist(request.auth.establishmentId, query, request.auth)
  })

  app.post('/', { config: { permission: 'agenda.create' } }, async (request, reply) => {
    const input = createWaitlistSchema.parse(request.body)
    const entry = await waitlistService.createWaitlistEntry(
      request.auth.establishmentId,
      input,
      request.auth,
    )
    return reply.status(201).send(entry)
  })

  app.post('/:id/promote', { config: { permission: 'agenda.create' } }, async (request) => {
    const { id } = idParamSchema.parse(request.params)
    const input = promoteWaitlistSchema.parse(request.body)
    return waitlistService.promoteWaitlistEntry(
      request.auth.establishmentId,
      id,
      input,
      request.auth,
    )
  })

  // Sair da fila não é cancelar agendamento (nada foi marcado ainda): quem
  // administra a fila é quem agenda, então o gate é o mesmo de criar.
  app.delete('/:id', { config: { permission: 'agenda.create' } }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    await waitlistService.deleteWaitlistEntry(request.auth.establishmentId, id, request.auth)
    return reply.status(204).send()
  })
}
