import type { FastifyInstance } from 'fastify'
import { commissionsQuerySchema } from './schemas'
import * as commissionsService from './service'

export async function commissionsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  // Gate baixo de propósito: sem `finance.payroll` o serviço devolve só a
  // comissão de quem pediu. A folha dos colegas é que exige a permissão.
  app.get('/', { config: { permission: 'agenda.view' } }, async (request) => {
    const query = commissionsQuerySchema.parse(request.query)
    return commissionsService.getCommissionsReport(
      request.auth.establishmentId,
      query,
      request.auth,
    )
  })
}
