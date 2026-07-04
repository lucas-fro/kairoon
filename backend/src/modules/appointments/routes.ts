import type { FastifyInstance } from 'fastify'
import {
  createAppointmentSchema,
  idParamSchema,
  listAppointmentsQuerySchema,
  searchAppointmentsQuerySchema,
  updateAppointmentSchema,
} from './schemas'
import * as appointmentsService from './service'

export async function appointmentsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  app.get('/', async (request) => {
    const query = listAppointmentsQuerySchema.parse(request.query)
    return appointmentsService.listAppointments(request.user.establishmentId, query)
  })

  app.get('/search', async (request) => {
    const query = searchAppointmentsQuerySchema.parse(request.query)
    return appointmentsService.searchAppointments(request.user.establishmentId, query)
  })

  app.get('/:id', async (request) => {
    const { id } = idParamSchema.parse(request.params)
    return appointmentsService.getAppointment(request.user.establishmentId, id)
  })

  app.post('/', async (request, reply) => {
    const input = createAppointmentSchema.parse(request.body)
    const appointment = await appointmentsService.createAppointment(
      request.user.establishmentId,
      input,
    )
    return reply.status(201).send(appointment)
  })

  app.patch('/:id', async (request) => {
    const { id } = idParamSchema.parse(request.params)
    const input = updateAppointmentSchema.parse(request.body)
    return appointmentsService.updateAppointment(request.user.establishmentId, id, input)
  })
}
