import { z } from 'zod'
import { DATE_REGEX, TIME_REGEX, isValidDateStr } from '../../lib/datetime'

const dateStringSchema = (message: string) =>
  z.string().regex(DATE_REGEX, message).refine(isValidDateStr, message)

export const waitlistStatusSchema = z.enum(['waiting', 'scheduled'])

export const listWaitlistQuerySchema = z.object({
  status: waitlistStatusSchema.optional(),
  date: dateStringSchema('Data inválida').optional(),
})

export const createWaitlistSchema = z.object({
  clientId: z.string().uuid('Cliente inválido'),
  serviceId: z.string().uuid('Serviço inválido'),
  preferredEmployeeId: z.string().uuid('Profissional inválido').optional(),
  targetDate: dateStringSchema('Data inválida').optional(),
  note: z.string().trim().max(200, 'Observação muito longa').optional(),
})

export const promoteWaitlistSchema = z.object({
  startTime: z.string().regex(TIME_REGEX, 'Horário inválido'),
  employeeId: z.string().uuid('Profissional inválido').optional(),
})

export const idParamSchema = z.object({ id: z.string().uuid('Item inválido') })

export type ListWaitlistQuery = z.infer<typeof listWaitlistQuerySchema>
export type CreateWaitlistInput = z.infer<typeof createWaitlistSchema>
export type PromoteWaitlistInput = z.infer<typeof promoteWaitlistSchema>
