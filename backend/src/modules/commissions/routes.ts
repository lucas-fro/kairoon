import type { FastifyInstance } from 'fastify'
import { commissionsQuerySchema } from './schemas'
import * as commissionsService from './service'

export async function commissionsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  app.get('/', async (request) => {
    const query = commissionsQuerySchema.parse(request.query)
    return commissionsService.getCommissionsReport(request.user.establishmentId, query)
  })
}
