import type { FastifyInstance } from 'fastify'
import { createEmployeeSchema, idParamSchema, updateEmployeeSchema } from './schemas'
import * as employeesService from './service'

export async function employeesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  // Leitura da equipe, não gestão: a agenda consome esta lista para montar as
  // colunas e o seletor. Apertar para 'employees.manage' quebraria a agenda de
  // quem só atende. Como o gate é baixo (e 'agenda.view' já o implica), o
  // serviço redige salário, folha, comissão e permissões de quem não tem
  // 'finance.payroll' ou não é o dono.
  app.get('/', { config: { permission: 'employees.view' } }, async (request) => {
    return employeesService.listEmployees(request.auth.establishmentId, request.auth)
  })

  app.post('/', { config: { permission: 'employees.manage' } }, async (request, reply) => {
    const input = createEmployeeSchema.parse(request.body)
    const employee = await employeesService.createEmployee(
      request.auth.establishmentId,
      input,
      request.auth,
    )
    return reply.status(201).send(employee)
  })

  app.put('/:id', { config: { permission: 'employees.manage' } }, async (request) => {
    const { id } = idParamSchema.parse(request.params)
    const input = updateEmployeeSchema.parse(request.body)
    return employeesService.updateEmployee(request.auth.establishmentId, id, input, request.auth)
  })

  app.delete('/:id', { config: { permission: 'employees.manage' } }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    await employeesService.deleteEmployee(request.auth.establishmentId, id, request.auth)
    return reply.status(204).send()
  })
}
