import { z } from 'zod'
import { DATE_REGEX, isValidDateStr } from '../../lib/datetime'

const dateStringSchema = (message: string) =>
  z.string().regex(DATE_REGEX, message).refine(isValidDateStr, message)

export const transactionTypeSchema = z.enum(['income', 'expense'])

export const listTransactionsQuerySchema = z.object({
  from: dateStringSchema('Data inicial inválida (use YYYY-MM-DD)').optional(),
  to: dateStringSchema('Data final inválida (use YYYY-MM-DD)').optional(),
  type: transactionTypeSchema.optional(),
})

export const createTransactionSchema = z.object({
  description: z.string().min(2, 'Descrição deve ter no mínimo 2 caracteres'),
  amountCents: z.number().int('Valor deve ser inteiro em centavos').min(1, 'Valor mínimo de 1 centavo'),
  type: transactionTypeSchema,
  date: dateStringSchema('Data inválida (use YYYY-MM-DD)'),
})

export const idParamSchema = z.object({ id: z.string().uuid('Identificador inválido') })

export type TransactionType = z.infer<typeof transactionTypeSchema>
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>
