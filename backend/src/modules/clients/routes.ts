import type { FastifyInstance } from 'fastify'
import {
  createClientSchema,
  idParamSchema,
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
