import { z } from 'zod'
import { DATE_REGEX, isValidDateStr } from '../../lib/datetime'

const dateStringSchema = (message: string) =>
  z.string().regex(DATE_REGEX, message).refine(isValidDateStr, message)

export const commissionsQuerySchema = z.object({
  from: dateStringSchema('Data inicial inválida (use YYYY-MM-DD)').optional(),
  to: dateStringSchema('Data final inválida (use YYYY-MM-DD)').optional(),
})

export type CommissionsQuery = z.infer<typeof commissionsQuerySchema>
