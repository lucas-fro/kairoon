import { z } from 'zod'
import { DATE_REGEX, isValidDateStr } from '../../lib/datetime'
import { isValidPhone, normalizePhone } from '../../lib/slots'

const nameSchema = z.string().trim().min(2, 'Nome deve ter no mínimo 2 caracteres')

const phoneSchema = z
  .string()
  .min(1, 'Informe o telefone')
  .transform((value) => normalizePhone(value))
  .refine(isValidPhone, {
    message: 'Celular inválido (informe DDD + número com 11 dígitos)',
  })

const emptyToNull = <T extends z.ZodTypeAny>(schema: T) =>
  schema
    .or(z.literal(''))
    .transform((value) => (value === '' ? null : value))
    .optional()

export const createClientSchema = z.object({
  name: nameSchema,
  phone: phoneSchema,
  email: emptyToNull(z.string().trim().email('E-mail inválido')),
  birthDate: emptyToNull(
    z.string().regex(DATE_REGEX, 'Data inválida').refine(isValidDateStr, 'Data inválida'),
  ),
  gender: emptyToNull(z.enum(['masculino', 'feminino', 'outro'])),
})

export const updateClientSchema = createClientSchema.partial()

export const listClientsQuerySchema = z.object({
  search: z.string().trim().optional(),
})

export const idParamSchema = z.object({ id: z.string().uuid() })

export type CreateClientInput = z.infer<typeof createClientSchema>
export type UpdateClientInput = z.infer<typeof updateClientSchema>
export type ListClientsQuery = z.infer<typeof listClientsQuerySchema>
