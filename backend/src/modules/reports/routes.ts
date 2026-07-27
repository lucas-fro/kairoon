import type { FastifyInstance, FastifyRequest } from 'fastify'
import { assertFeature } from '../../lib/plan'
import {
  dateRangeQuerySchema,
  groupedQuerySchema,
  revenueQuerySchema,
  topServicesQuerySchema,
} from './schemas'
import * as reportsService from './service'

/** Relatórios avançados: exigem o plano Essencial. */
async function requireAdvancedReports(request: FastifyRequest) {
  await assertFeature(request.user.establishmentId, 'relatorios_avancados')
}

export async function reportsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)
  // Relatórios essenciais já exigem plano pago (básico ou superior).
  app.addHook('preHandler', async (request) => {
    await assertFeature(request.user.establishmentId, 'relatorios')
  })

  // --- Relatórios essenciais (plano Básico) ---
  app.get('/revenue', { config: { permission: 'reports.view' } }, async (request) => {
    const query = revenueQuerySchema.parse(request.query)
    return reportsService.getRevenueReport(request.user.establishmentId, query)
  })

  app.get('/top-services', { config: { permission: 'reports.view' } }, async (request) => {
    const query = topServicesQuerySchema.parse(request.query)
    return reportsService.getTopServicesReport(request.user.establishmentId, query)
  })

  app.get('/new-clients', { config: { permission: 'reports.view' } }, async (request) => {
    const query = groupedQuerySchema.parse(request.query)
    return reportsService.getNewClientsReport(request.user.establishmentId, query)
  })

  app.get('/appointments-by-status', { config: { permission: 'reports.view' } }, async (request) => {
    const query = groupedQuerySchema.parse(request.query)
    return reportsService.getAppointmentsByStatusReport(request.user.establishmentId, query)
  })

  // --- Relatórios avançados (plano Essencial) ---
  // Os dois gates são cumulativos: o plano diz se a casa comprou o relatório, a
  // permissão diz quem dentro dela pode abrir. Reprovar em qualquer um barra.
  app.get(
    '/occupancy',
    { preHandler: requireAdvancedReports, config: { permission: 'reports.view' } },
    async (request) => {
      const query = dateRangeQuerySchema.parse(request.query)
      return reportsService.getOccupancyReport(request.user.establishmentId, query)
    },
  )

  app.get(
    '/payment-methods',
    { preHandler: requireAdvancedReports, config: { permission: 'reports.view' } },
    async (request) => {
      const query = dateRangeQuerySchema.parse(request.query)
      return reportsService.getPaymentMethodsReport(request.user.establishmentId, query)
    },
  )

  app.get(
    '/top-clients',
    { preHandler: requireAdvancedReports, config: { permission: 'reports.view' } },
    async (request) => {
      const query = dateRangeQuerySchema.parse(request.query)
      return reportsService.getTopClientsReport(request.user.establishmentId, query)
    },
  )

  app.get(
    '/revenue-by-employee',
    { preHandler: requireAdvancedReports, config: { permission: 'reports.view' } },
    async (request) => {
      const query = dateRangeQuerySchema.parse(request.query)
      return reportsService.getRevenueByEmployeeReport(request.user.establishmentId, query)
    },
  )

  app.get(
    '/busy-hours',
    { preHandler: requireAdvancedReports, config: { permission: 'reports.view' } },
    async (request) => {
      const query = dateRangeQuerySchema.parse(request.query)
      return reportsService.getBusyHoursReport(request.user.establishmentId, query)
    },
  )
}
