import { z } from 'zod'
import { DATE_REGEX, TIME_REGEX, isValidDateStr } from '../../lib/datetime'

const dateStringSchema = z
  .string()
  .regex(DATE_REGEX, 'Data inválida')
  .refine(isValidDateStr, 'Data inválida')

export const slugParamSchema = z.object({ slug: z.string().min(1) })

export const availabilityQuerySchema = z.object({
  serviceId: z.string().uuid('Serviço inválido'),
  date: dateStringSchema,
  employeeId: z.string().uuid().optional(),
})

export const identifyClientSchema = z.object({
  phone: z.string().min(8, 'Telefone inválido'),
})

export const createBookingSchema = z.object({
  serviceId: z.string().uuid('Serviço inválido'),
  employeeId: z.string().uuid().optional(),
  date: dateStringSchema,
  startTime: z.string().regex(TIME_REGEX, 'Horário inválido'),
  client: z.object({
    name: z.string().min(2, 'Informe seu nome'),
    phone: z.string().min(10, 'Telefone inválido'),
    email: z.string().email('E-mail inválido').or(z.literal('')).optional(),
    birthDate: z
      .string()
      .regex(DATE_REGEX, 'Data inválida')
      .refine(isValidDateStr, 'Data inválida')
      .or(z.literal(''))
      .optional(),
    gender: z.enum(['masculino', 'feminino', 'outro']).or(z.literal('')).optional(),
  }),
})

export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>
export type CreateBookingInput = z.infer<typeof createBookingSchema>
