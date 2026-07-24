import type { FastifyInstance } from 'fastify'
import {
  createRecurringExpenseSchema,
  idParamSchema,
  monthQuerySchema,
  settlePayrollSchema,
  settleSchema,
  updateRecurringExpenseSchema,
} from './schemas'
import * as recurringExpensesService from './service'

export async function recurringExpensesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  app.get('/', async (request) => {
    return recurringExpensesService.listRecurringExpenses(request.user.establishmentId)
  })

  app.get('/forecast', async (request) => {
    const { month } = monthQuerySchema.parse(request.query)
    return recurringExpensesService.getForecast(request.user.establishmentId, month)
  })

  app.post('/', async (request, reply) => {
    const input = createRecurringExpenseSchema.parse(request.body)
    const created = await recurringExpensesService.createRecurringExpense(
      request.user.establishmentId,
      input,
    )
    return reply.status(201).send(created)
  })

  app.put('/:id', async (request) => {
    const { id } = idParamSchema.parse(request.params)
    const input = updateRecurringExpenseSchema.parse(request.body)
    return recurringExpensesService.updateRecurringExpense(request.user.establishmentId, id, input)
  })

  app.delete('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    await recurringExpensesService.deleteRecurringExpense(request.user.establishmentId, id)
    return reply.status(204).send()
  })

  // Baixa da folha de um profissional, rota estática (tem prioridade sobre /:id)
  app.post('/payroll/settle', async (request, reply) => {
    const { employeeId, month, day } = settlePayrollSchema.parse(request.body)
    const transaction = await recurringExpensesService.settlePayroll(
      request.user.establishmentId,
      employeeId,
      month,
      day,
    )
    return reply.status(201).send(transaction)
  })

  app.post('/:id/settle', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    const { month } = settleSchema.parse(request.body)
    const transaction = await recurringExpensesService.settle(
      request.user.establishmentId,
      id,
      month,
    )
    return reply.status(201).send(transaction)
  })
}
