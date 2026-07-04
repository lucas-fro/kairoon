import type { FastifyInstance } from 'fastify'
import * as dashboardService from './service'

export async function dashboardRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  app.get('/summary', async (request) => {
    return dashboardService.getSummary(request.user.establishmentId)
  })
}
