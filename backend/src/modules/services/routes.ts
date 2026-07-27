import type { FastifyInstance } from 'fastify'
import { createServiceSchema, idParamSchema, updateServiceSchema } from './schemas'
import * as servicesService from './service'

export async function servicesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  // A leitura é 'catalog.lookup', e não 'services.manage': quem cria agendamento
  // ou fecha comanda precisa escolher o serviço mesmo sem cuidar do catálogo. A
  // aba Serviços em si continua escondida no frontend por services.manage.
  app.get('/', { config: { permission: 'catalog.lookup' } }, async (request) => {
    return servicesService.listServices(request.user.establishmentId)
  })

  app.post('/', { config: { permission: 'services.manage' } }, async (request, reply) => {
    const input = createServiceSchema.parse(request.body)
    const service = await servicesService.createService(request.user.establishmentId, input)
    return reply.status(201).send(service)
  })

  app.put('/:id', { config: { permission: 'services.manage' } }, async (request) => {
    const { id } = idParamSchema.parse(request.params)
    const input = updateServiceSchema.parse(request.body)
    return servicesService.updateService(request.user.establishmentId, id, input)
  })

  app.delete('/:id', { config: { permission: 'services.manage' } }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    await servicesService.deleteService(request.user.establishmentId, id)
    return reply.status(204).send()
  })
}
