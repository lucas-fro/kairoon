import type { FastifyInstance } from 'fastify'
import { assertFeature } from '../../lib/plan'
import {
  createClientSchema,
  idParamSchema,
  lapsedQuerySchema,
  listClientsQuerySchema,
  updateClientSchema,
} from './schemas'
import * as clientsService from './service'

export async function clientsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  app.get('/', async (request) => {
    const { search } = listClientsQuerySchema.parse(request.query)
    return clientsService.listClients(request.user.establishmentId, search)
  })

  // Insights de clientes (aniversariantes / sumidos) — plano Essencial+.
  // Rotas estáticas: o find-my-way as prioriza sobre '/:id'.
  app.get('/birthdays', async (request) => {
    await assertFeature(request.user.establishmentId, 'clientes_crm')
    return clientsService.listBirthdays(request.user.establishmentId)
  })

  app.get('/lapsed', async (request) => {
    await assertFeature(request.user.establishmentId, 'clientes_crm')
    const { minDays } = lapsedQuerySchema.parse(request.query)
    return clientsService.listLapsed(request.user.establishmentId, minDays)
  })

  app.get('/:id', async (request) => {
    const { id } = idParamSchema.parse(request.params)
    return clientsService.getClientDetails(request.user.establishmentId, id)
  })

  app.post('/', async (request, reply) => {
    const input = createClientSchema.parse(request.body)
    const client = await clientsService.createClient(request.user.establishmentId, input)
    return reply.status(201).send(client)
  })

  app.put('/:id', async (request) => {
    const { id } = idParamSchema.parse(request.params)
    const input = updateClientSchema.parse(request.body)
    return clientsService.updateClient(request.user.establishmentId, id, input)
  })
}
