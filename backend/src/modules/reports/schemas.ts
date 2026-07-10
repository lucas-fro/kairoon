import { z } from 'zod'
import { DATE_REGEX, isValidDateStr } from '../../lib/datetime'

const dateStringSchema = (message: string) =>
  z.string().regex(DATE_REGEX, message).refine(isValidDateStr, message)

export const dateRangeQuerySchema = z.object({
  from: dateStringSchema('Data inicial inválida (use YYYY-MM-DD)').optional(),
  to: dateStringSchema('Data final inválida (use YYYY-MM-DD)').optional(),
})

const groupByField = z.enum(['day', 'month']).default('day')

export const revenueQuerySchema = dateRangeQuerySchema.extend({
  groupBy: groupByField,
})

// Relatórios agrupados por período (novos clientes, agendamentos por status).
export const groupedQuerySchema = dateRangeQuerySchema.extend({
  groupBy: groupByField,
})

// Serviços: ranking por volume de agendamentos ou por receita.
export const topServicesQuerySchema = dateRangeQuerySchema.extend({
  sort: z.enum(['count', 'revenue']).default('count'),
})

export type DateRangeQuery = z.infer<typeof dateRangeQuerySchema>
export type RevenueQuery = z.infer<typeof revenueQuerySchema>
export type GroupedQuery = z.infer<typeof groupedQuerySchema>
export type TopServicesQuery = z.infer<typeof topServicesQuerySchema>
