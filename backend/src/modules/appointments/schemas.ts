import { z } from 'zod'
import { DATE_REGEX, TIME_REGEX, isValidDateStr } from '../../lib/datetime'

const dateStringSchema = (message: string) =>
  z.string().regex(DATE_REGEX, message).refine(isValidDateStr, message)

export const appointmentStatusSchema = z.enum(['confirmed', 'cancelled', 'completed', 'pending'])

export const listAppointmentsQuerySchema = z.object({
  start: dateStringSchema('Data inicial inválida'),
  end: dateStringSchema('Data final inválida'),
  employeeId: z.string().uuid('Profissional inválido').optional(),
  status: appointmentStatusSchema.optional(),
})

export const idParamSchema = z.object({ id: z.string().uuid('Agendamento inválido') })

export const searchAppointmentsQuerySchema = z.object({
  q: z.string().trim().min(1, 'Informe o termo de busca'),
})

export const createAppointmentSchema = z
  .object({
    serviceId: z.string().uuid('Serviço inválido'),
    employeeId: z.string().uuid('Profissional inválido'),
    date: dateStringSchema('Data inválida'),
    startTime: z.string().regex(TIME_REGEX, 'Horário inválido'),
    notes: z.string().max(500, 'Observações muito longas').optional(),
    clientId: z.string().uuid('Cliente inválido').optional(),
    clientName: z.string().min(2, 'Informe o nome do cliente').optional(),
    clientPhone: z.string().min(10, 'Telefone inválido').optional(),
  })
  .refine((data) => Boolean(data.clientId) || Boolean(data.clientName && data.clientPhone), {
    message: 'Informe o cliente (clientId) ou o nome e telefone do cliente',
    path: ['clientId'],
  })

export const paymentMethodSchema = z.enum(['cash', 'pix', 'debit', 'credit'])

export const updateAppointmentSchema = z.object({
  status: appointmentStatusSchema.optional(),
  date: dateStringSchema('Data inválida').optional(),
  startTime: z.string().regex(TIME_REGEX, 'Horário inválido').optional(),
  employeeId: z.string().uuid('Profissional inválido').optional(),
  // Fechamento do serviço
  discountCents: z.number().int().min(0, 'Desconto inválido').optional(),
  payments: z
    .array(
      z.object({
        method: paymentMethodSchema,
        brand: z.string().trim().max(40).nullable().optional(),
        installments: z.number().int().min(1).max(24).nullable().optional(),
        amountCents: z.number().int().min(0),
      }),
    )
    .optional(),
  // Produtos vendidos junto: o backend busca nome/preço atuais
  saleProducts: z
    .array(
      z.object({
        productId: z.string().uuid('Produto inválido'),
        quantity: z.number().int().min(1, 'Quantidade inválida'),
      }),
    )
    .optional(),
})

export type ListAppointmentsQuery = z.infer<typeof listAppointmentsQuerySchema>
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>
export type SearchAppointmentsQuery = z.infer<typeof searchAppointmentsQuerySchema>
