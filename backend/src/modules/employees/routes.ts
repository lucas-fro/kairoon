import type { FastifyInstance } from 'fastify'
import { createEmployeeSchema, idParamSchema, updateEmployeeSchema } from './schemas'
import * as employeesService from './service'

export async function employeesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  app.get('/', async (request) => {
    return employeesService.listEmployees(request.user.establishmentId)
  })

  app.post('/', async (request, reply) => {
    const input = createEmployeeSchema.parse(request.body)
    const employee = await employeesService.createEmployee(request.user.establishmentId, input)
    return reply.status(201).send(employee)
  })

  app.put('/:id', async (request) => {
    const { id } = idParamSchema.parse(request.params)
    const input = updateEmployeeSchema.parse(request.body)
    return employeesService.updateEmployee(request.user.establishmentId, id, input)
  })

  app.delete('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    await employeesService.deleteEmployee(request.user.establishmentId, id)
    return reply.status(204).send()
  })
}
