import { z } from 'zod'
import { DATE_REGEX, isValidDateStr } from '../../lib/datetime'

const dateStringSchema = (message: string) =>
  z.string().regex(DATE_REGEX, message).refine(isValidDateStr, message)

export const dateRangeQuerySchema = z.object({
  from: dateStringSchema('Data inicial inválida (use YYYY-MM-DD)').optional(),
  to: dateStringSchema('Data final inválida (use YYYY-MM-DD)').optional(),
})

export const revenueQuerySchema = dateRangeQuerySchema.extend({
  groupBy: z.enum(['day', 'month']).default('day'),
})

export type DateRangeQuery = z.infer<typeof dateRangeQuerySchema>
export type RevenueQuery = z.infer<typeof revenueQuerySchema>
