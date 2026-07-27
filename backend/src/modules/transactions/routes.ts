import type { FastifyInstance } from 'fastify'
import { createTransactionSchema, idParamSchema, listTransactionsQuerySchema } from './schemas'
import * as transactionsService from './service'

export async function transactionsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  app.get('/', { config: { permission: 'finance.view' } }, async (request) => {
    const query = listTransactionsQuerySchema.parse(request.query)
    return transactionsService.listTransactions(request.auth.establishmentId, query, request.auth)
  })

  app.post('/', { config: { permission: 'finance.manage' } }, async (request, reply) => {
    const input = createTransactionSchema.parse(request.body)
    const transaction = await transactionsService.createTransaction(
      request.user.establishmentId,
      input,
    )
    return reply.status(201).send(transaction)
  })

  app.delete('/:id', { config: { permission: 'finance.manage' } }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    await transactionsService.deleteTransaction(request.user.establishmentId, id)
    return reply.status(204).send()
  })
}
