import { z } from 'zod'
import { DATE_REGEX, isValidDateStr } from '../../lib/datetime'

const digitsOnly = (value: string) => value.replace(/\D/g, '')

const cpfSchema = z
  .string()
  .trim()
  .refine((value) => digitsOnly(value).length === 11, 'Informe um CPF válido (11 dígitos)')

const cnpjSchema = z
  .string()
  .trim()
  .refine((value) => digitsOnly(value).length === 14, 'Informe um CNPJ válido (14 dígitos)')

const phoneSchema = z
  .string()
  .trim()
  .refine(
    (value) => [10, 11].includes(digitsOnly(value).length),
    'Informe um telefone válido (DDD + número)',
  )

const emptyToNull = <T extends z.ZodTypeAny>(schema: T) =>
  schema
    .or(z.literal(''))
    .transform((value) => (value === '' ? null : value))
    .optional()

export const registerSchema = z.object({
  name: z.string().min(2, 'Nome muito curto'),
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres'),
  cpf: cpfSchema,
  phone: phoneSchema,
  establishment: z.object({
    name: z.string().min(2, 'Nome do negócio muito curto'),
    slug: z
      .string()
      .min(3, 'O link deve ter no mínimo 3 caracteres')
      .max(40, 'O link deve ter no máximo 40 caracteres')
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use apenas letras minúsculas, números e hífens'),
    businessType: z.enum(['barbearia', 'salao', 'clinica', 'outro']),
    phone: z.string().optional(),
    document: cnpjSchema,
    address: z.string().trim().min(5, 'Informe o endereço do estabelecimento'),
    cep: emptyToNull(
      z.string().refine((value) => digitsOnly(value).length === 8, 'CEP inválido (8 dígitos)'),
    ),
  }),
  quiz: z.record(z.string()).optional(),
})

export const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Informe a senha'),
})

export const slugAvailabilitySchema = z.object({
  slug: z.string().trim().min(1, 'Informe o link'),
})

export const updateProfileSchema = z.object({
  name: z.string().min(2, 'Nome muito curto').optional(),
  email: z.string().email('E-mail inválido').optional(),
  phone: emptyToNull(z.string().trim().max(20, 'Telefone inválido')),
  birthDate: emptyToNull(
    z.string().regex(DATE_REGEX, 'Data inválida').refine(isValidDateStr, 'Data inválida'),
  ),
  cpf: emptyToNull(cpfSchema),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
