import type { FastifyInstance } from 'fastify'
import {
  createAppointmentSchema,
  idParamSchema,
  listAppointmentsQuerySchema,
  recentAppointmentsQuerySchema,
  searchAppointmentsQuerySchema,
  updateAppointmentSchema,
} from './schemas'
import * as appointmentsService from './service'

export async function appointmentsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  // Toda leitura passa o `auth`: quem não tem agenda.view_all só enxerga a
  // própria agenda, e essa restrição é aplicada no serviço (nunca no filtro
  // que a tela manda).
  app.get('/', { config: { permission: 'agenda.view' } }, async (request) => {
    const query = listAppointmentsQuerySchema.parse(request.query)
    return appointmentsService.listAppointments(
      request.auth.establishmentId,
      query,
      request.auth,
    )
  })

  app.get('/search', { config: { permission: 'agenda.view' } }, async (request) => {
    const query = searchAppointmentsQuerySchema.parse(request.query)
    return appointmentsService.searchAppointments(
      request.auth.establishmentId,
      query,
      request.auth,
    )
  })

  app.get('/recent', { config: { permission: 'agenda.view' } }, async (request) => {
    const query = recentAppointmentsQuerySchema.parse(request.query)
    return appointmentsService.listRecentAppointments(
      request.auth.establishmentId,
      query,
      request.auth,
    )
  })

  app.get('/:id', { config: { permission: 'agenda.view' } }, async (request) => {
    const { id } = idParamSchema.parse(request.params)
    return appointmentsService.getAppointmentForUser(request.auth.establishmentId, id, request.auth)
  })

  app.post('/', { config: { permission: 'agenda.create' } }, async (request, reply) => {
    const input = createAppointmentSchema.parse(request.body)
    const appointment = await appointmentsService.createAppointment(
      request.auth.establishmentId,
      input,
      request.auth,
    )
    return reply.status(201).send(appointment)
  })

  // Um PATCH só carrega remarcar, cancelar e fechar comanda, que são permissões
  // diferentes. O gate da rota exige o mínimo (ver a agenda) e a permissão real
  // é decidida pelo conteúdo, em service.assertUpdatePermission.
  app.patch('/:id', { config: { permission: 'agenda.view' } }, async (request) => {
    const { id } = idParamSchema.parse(request.params)
    const input = updateAppointmentSchema.parse(request.body)
    return appointmentsService.updateAppointment(
      request.auth.establishmentId,
      id,
      input,
      request.auth,
    )
  })
}
