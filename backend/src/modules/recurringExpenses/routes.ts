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

  app.get('/', { config: { permission: 'finance.view' } }, async (request) => {
    return recurringExpensesService.listRecurringExpenses(request.user.establishmentId)
  })

  app.get('/forecast', { config: { permission: 'finance.view' } }, async (request) => {
    const { month } = monthQuerySchema.parse(request.query)
    return recurringExpensesService.getForecast(request.auth.establishmentId, month, request.auth)
  })

  app.post('/', { config: { permission: 'finance.manage' } }, async (request, reply) => {
    const input = createRecurringExpenseSchema.parse(request.body)
    const created = await recurringExpensesService.createRecurringExpense(
      request.user.establishmentId,
      input,
    )
    return reply.status(201).send(created)
  })

  app.put('/:id', { config: { permission: 'finance.manage' } }, async (request) => {
    const { id } = idParamSchema.parse(request.params)
    const input = updateRecurringExpenseSchema.parse(request.body)
    return recurringExpensesService.updateRecurringExpense(request.user.establishmentId, id, input)
  })

  app.delete('/:id', { config: { permission: 'finance.manage' } }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    await recurringExpensesService.deleteRecurringExpense(request.user.establishmentId, id)
    return reply.status(204).send()
  })

  // Baixa da folha de um profissional, rota estática (tem prioridade sobre /:id).
  // Exige `finance.payroll`, e não `finance.manage` como as vizinhas: isto lança
  // salário (e a comissão do mês na última parcela), que o catálogo reserva para
  // a folha. O preset "Gerente" tem manage sem payroll justamente porque promete
  // "menos salários e folha da equipe".
  app.post('/payroll/settle', { config: { permission: 'finance.payroll' } }, async (request, reply) => {
    const { employeeId, month, day } = settlePayrollSchema.parse(request.body)
    const transaction = await recurringExpensesService.settlePayroll(
      request.user.establishmentId,
      employeeId,
      month,
      day,
    )
    return reply.status(201).send(transaction)
  })

  app.post('/:id/settle', { config: { permission: 'finance.manage' } }, async (request, reply) => {
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
