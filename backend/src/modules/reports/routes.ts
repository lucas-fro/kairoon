import type { FastifyInstance } from 'fastify'
import { dateRangeQuerySchema, revenueQuerySchema } from './schemas'
import * as reportsService from './service'

export async function reportsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  app.get('/revenue', async (request) => {
    const query = revenueQuerySchema.parse(request.query)
    return reportsService.getRevenueReport(request.user.establishmentId, query)
  })

  app.get('/top-services', async (request) => {
    const query = dateRangeQuerySchema.parse(request.query)
    return reportsService.getTopServicesReport(request.user.establishmentId, query)
  })

  app.get('/occupancy', async (request) => {
    const query = dateRangeQuerySchema.parse(request.query)
    return reportsService.getOccupancyReport(request.user.establishmentId, query)
  })
}
