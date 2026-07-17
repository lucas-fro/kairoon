import type { FastifyInstance } from 'fastify'
import { assertFeature } from '../../lib/plan'
import {
  dateRangeQuerySchema,
  groupedQuerySchema,
  revenueQuerySchema,
  topServicesQuerySchema,
} from './schemas'
import * as reportsService from './service'

export async function reportsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)
  // Relatórios são um recurso de plano pago (básico ou superior).
  app.addHook('preHandler', async (request) => {
    await assertFeature(request.user.establishmentId, 'relatorios')
  })

  app.get('/revenue', async (request) => {
    const query = revenueQuerySchema.parse(request.query)
    return reportsService.getRevenueReport(request.user.establishmentId, query)
  })

  app.get('/top-services', async (request) => {
    const query = topServicesQuerySchema.parse(request.query)
    return reportsService.getTopServicesReport(request.user.establishmentId, query)
  })

  app.get('/occupancy', async (request) => {
    const query = dateRangeQuerySchema.parse(request.query)
    return reportsService.getOccupancyReport(request.user.establishmentId, query)
  })

  app.get('/payment-methods', async (request) => {
    const query = dateRangeQuerySchema.parse(request.query)
    return reportsService.getPaymentMethodsReport(request.user.establishmentId, query)
  })

  app.get('/top-clients', async (request) => {
    const query = dateRangeQuerySchema.parse(request.query)
    return reportsService.getTopClientsReport(request.user.establishmentId, query)
  })

  app.get('/revenue-by-employee', async (request) => {
    const query = dateRangeQuerySchema.parse(request.query)
    return reportsService.getRevenueByEmployeeReport(request.user.establishmentId, query)
  })

  app.get('/new-clients', async (request) => {
    const query = groupedQuerySchema.parse(request.query)
    return reportsService.getNewClientsReport(request.user.establishmentId, query)
  })

  app.get('/appointments-by-status', async (request) => {
    const query = groupedQuerySchema.parse(request.query)
    return reportsService.getAppointmentsByStatusReport(request.user.establishmentId, query)
  })

  app.get('/busy-hours', async (request) => {
    const query = dateRangeQuerySchema.parse(request.query)
    return reportsService.getBusyHoursReport(request.user.establishmentId, query)
  })
}
