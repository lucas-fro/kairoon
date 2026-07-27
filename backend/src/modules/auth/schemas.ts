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
  // Dados de identidade do dono: opcionais no cadastro, completáveis depois nas
  // configurações. Só pedimos o essencial para criar a conta.
  cpf: emptyToNull(cpfSchema),
  phone: emptyToNull(phoneSchema),
  establishment: z.object({
    name: z.string().min(2, 'Nome do negócio muito curto'),
    slug: z
      .string()
      .min(3, 'O link deve ter no mínimo 3 caracteres')
      .max(40, 'O link deve ter no máximo 40 caracteres')
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use apenas letras minúsculas, números e hífens'),
    businessType: z.enum(['barbearia', 'salao', 'clinica', 'outro']),
    // Contato público do estabelecimento: o que o cliente vê na página de
    // agendamento. Pode reaproveitar o contato pessoal do dono (ver frontend).
    phone: z.string().optional(),
    email: z
      .union([z.string().email('E-mail inválido'), z.literal('')])
      .transform((value) => (value === '' ? null : value))
      .optional(),
    socials: z
      .object({
        instagram: z.string().trim().max(60).optional(),
        whatsapp: z.string().trim().max(20).optional(),
      })
      .optional(),
    // Dados fiscais/endereço: opcionais no cadastro, completáveis nas configurações.
    document: emptyToNull(cnpjSchema),
    address: emptyToNull(z.string().trim().min(3, 'Informe o endereço do estabelecimento')),
    addressNumber: emptyToNull(z.string().trim().max(20, 'Número inválido')),
    neighborhood: emptyToNull(z.string().trim().max(100, 'Bairro muito longo')),
    city: emptyToNull(z.string().trim().max(100, 'Cidade muito longa')),
    state: emptyToNull(z.string().trim().max(2, 'UF inválida')),
    cep: emptyToNull(
      z.string().refine((value) => digitsOnly(value).length === 8, 'CEP inválido (8 dígitos)'),
    ),
  // Opcional: no fluxo novo a conta é criada só com os dados pessoais (o negócio
  // é preenchido depois, com um link provisório). Quando ausente, o backend
  // sintetiza nome/link/tipo provisórios (ver service.registerOwner).
  }).optional(),
  quiz: z.record(z.string()).optional(),
  // Aceite dos Termos de Uso + Política de Privacidade (obrigatório no cadastro,
  // registrado com timestamp em users.termsAcceptedAt).
  acceptedLegal: z.boolean().refine((value) => value === true, {
    message: 'É necessário aceitar os Termos de Uso e a Política de Privacidade',
  }),
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

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Informe a senha atual'),
  newPassword: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres'),
})

const resetCodeSchema = z.string().trim().regex(/^\d{6}$/, 'O código deve ter 6 dígitos')

// Recuperação de senha pública (por e-mail), em três passos: pedir código,
// validar código, redefinir senha.
export const forgotPasswordRequestSchema = z.object({
  email: z.string().email('E-mail inválido'),
})

export const forgotPasswordVerifySchema = z.object({
  email: z.string().email('E-mail inválido'),
  code: resetCodeSchema,
})

export const forgotPasswordResetSchema = z.object({
  email: z.string().email('E-mail inválido'),
  code: resetCodeSchema,
  newPassword: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres'),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
