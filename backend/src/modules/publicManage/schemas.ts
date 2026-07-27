import { z } from 'zod'
import { DATE_REGEX, TIME_REGEX, isValidDateStr } from '../../lib/datetime'

const dateStringSchema = z
  .string()
  .regex(DATE_REGEX, 'Data inválida')
  .refine(isValidDateStr, 'Data inválida')

export const slugParamSchema = z.object({ slug: z.string().min(1) })

export const tokenQuerySchema = z.object({ t: z.string().min(10, 'Link inválido') })

export const requestCodeSchema = z.object({
  phone: z.string().min(8, 'Telefone inválido'),
})

export const verifyCodeSchema = z.object({
  phone: z.string().min(8, 'Telefone inválido'),
  code: z.string().regex(/^\d{6}$/, 'Código inválido'),
})

export const manageAvailabilityQuerySchema = z.object({
  date: dateStringSchema,
})

export const rescheduleSchema = z.object({
  date: dateStringSchema,
  startTime: z.string().regex(TIME_REGEX, 'Horário inválido'),
})

export type RequestCodeInput = z.infer<typeof requestCodeSchema>
export type VerifyCodeInput = z.infer<typeof verifyCodeSchema>
export type RescheduleInput = z.infer<typeof rescheduleSchema>
