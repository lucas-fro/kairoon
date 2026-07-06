import { z } from 'zod'
import { DATE_REGEX, TIME_REGEX, isValidDateStr, timeToMinutes } from '../../lib/datetime'

export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => (value === '' ? null : value))
    .optional()

export const updateEstablishmentSchema = z.object({
  name: z.string().min(1, 'Informe o nome do estabelecimento').optional(),
  phone: z.string().min(1, 'Informe o telefone').optional(),
  email: z
    .union([z.string().email('E-mail inválido'), z.literal('')])
    .transform((value) => (value === '' ? null : value))
    .optional(),
  document: optionalText(20, 'Documento inválido'),
  address: optionalText(200, 'Endereço muito longo'),
  addressNumber: optionalText(20, 'Número inválido'),
  neighborhood: optionalText(100, 'Bairro muito longo'),
  city: optionalText(100, 'Cidade muito longa'),
  state: optionalText(2, 'UF inválida'),
  cep: optionalText(12, 'CEP inválido'),
  socials: z
    .object({
      instagram: z.string().trim().max(60).optional(),
      whatsapp: z.string().trim().max(20).optional(),
    })
    .optional(),
  welcomeMessage: z.string().optional(),
  themeColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida (use o formato #RRGGBB)')
    .optional(),
  logoUrl: z
    .union([z.string().url('URL do logo inválida'), z.literal('')])
    .transform((value) => (value === '' ? null : value))
    .optional(),
  bannerImageUrl: z
    .union([z.string().url('URL do banner inválida'), z.literal('')])
    .transform((value) => (value === '' ? null : value))
    .optional(),
  footerMessage: optionalText(120, 'Mensagem muito longa'),
  businessType: z.enum(['barbearia', 'salao', 'clinica', 'outro']).optional(),
  autoConfirm: z.boolean().optional(),
  paymentSettings: z
    .object({
      cash: z.boolean(),
      pix: z.boolean(),
      debit: z.boolean(),
      credit: z.object({
        enabled: z.boolean(),
        brands: z
          .array(
            z.object({
              name: z.string().trim().min(1, 'Informe a bandeira').max(40, 'Nome muito longo'),
              maxInstallments: z.number().int().min(1).max(24),
            }),
          )
          .max(20, 'Muitas bandeiras'),
      }),
    })
    .optional(),
})

export const updateSlugSchema = z.object({
  slug: z
    .string()
    .min(3, 'O link deve ter pelo menos 3 caracteres')
    .max(40, 'O link deve ter no máximo 40 caracteres')
    .regex(SLUG_REGEX, 'Link inválido: use apenas letras minúsculas, números e hífens'),
})

export const slugAvailabilityQuerySchema = z.object({
  slug: z.string().min(1, 'Informe o link'),
})

const workingHourItemSchema = z.object({
  dayOfWeek: z.number().int().min(0, 'Dia da semana inválido').max(6, 'Dia da semana inválido'),
  opensAt: z.string().regex(TIME_REGEX, 'Horário de abertura inválido (use HH:mm)'),
  closesAt: z.string().regex(TIME_REGEX, 'Horário de fechamento inválido (use HH:mm)'),
  isClosed: z.boolean(),
})

export const updateWorkingHoursSchema = z.object({
  workingHours: z
    .array(workingHourItemSchema)
    .length(7, 'Informe os horários dos 7 dias da semana'),
})

const optionalTime = z
  .string()
  .regex(TIME_REGEX, 'Horário inválido')
  .or(z.literal(''))
  .transform((value) => (value === '' ? null : value))
  .optional()

export const createTimeBlockSchema = z
  .object({
    date: z.string().regex(DATE_REGEX, 'Data inválida').refine(isValidDateStr, 'Data inválida'),
    startTime: optionalTime,
    endTime: optionalTime,
    reason: z
      .string()
      .trim()
      .max(120, 'Motivo muito longo')
      .optional()
      .transform((value) => (value ? value : null)),
  })
  .refine((data) => Boolean(data.startTime) === Boolean(data.endTime), {
    message: 'Informe início e fim, ou deixe ambos vazios para bloquear o dia inteiro',
    path: ['startTime'],
  })
  .refine(
    (data) =>
      !data.startTime || !data.endTime || timeToMinutes(data.startTime) < timeToMinutes(data.endTime),
    { message: 'O horário de início deve ser anterior ao fim', path: ['endTime'] },
  )

export const timeBlockIdParamSchema = z.object({ id: z.string().uuid() })

export type UpdateEstablishmentInput = z.infer<typeof updateEstablishmentSchema>
export type UpdateWorkingHoursInput = z.infer<typeof updateWorkingHoursSchema>
export type WorkingHourItem = z.infer<typeof workingHourItemSchema>
export type CreateTimeBlockInput = z.infer<typeof createTimeBlockSchema>
