import { z } from 'zod'
import { PLANS } from '../../lib/plans'

const digitsOnly = (value: string) => value.replace(/\D/g, '')

const planSlugs = Object.keys(PLANS) as [keyof typeof PLANS, ...(keyof typeof PLANS)[]]

const cpfCnpjSchema = z
  .string()
  .trim()
  .transform(digitsOnly)
  .refine((value) => value.length === 11 || value.length === 14, 'Informe um CPF ou CNPJ válido')

const cardSchema = z.object({
  holderName: z.string().trim().min(2, 'Informe o nome impresso no cartão'),
  number: z
    .string()
    .transform(digitsOnly)
    .refine((value) => value.length >= 13 && value.length <= 19, 'Número de cartão inválido'),
  expiryMonth: z.string().regex(/^(0[1-9]|1[0-2])$/, 'Mês de validade inválido'),
  expiryYear: z.string().regex(/^\d{4}$/, 'Ano de validade inválido'),
  ccv: z
    .string()
    .transform(digitsOnly)
    .refine((value) => value.length === 3 || value.length === 4, 'CVV inválido'),
})

const holderSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do titular'),
  email: z.string().email('E-mail inválido'),
  cpfCnpj: cpfCnpjSchema,
  postalCode: z
    .string()
    .transform(digitsOnly)
    .refine((value) => value.length === 8, 'CEP inválido (8 dígitos)'),
  addressNumber: z.string().trim().min(1, 'Informe o número do endereço'),
  phone: z
    .string()
    .transform(digitsOnly)
    .refine((value) => value.length === 10 || value.length === 11, 'Telefone inválido'),
})

export const subscribeSchema = z.object({
  planSlug: z.enum(planSlugs),
  billingCycle: z.enum(['monthly', 'yearly']),
  card: cardSchema,
  holder: holderSchema,
})

export const changePlanSchema = z.object({
  planSlug: z.enum(planSlugs),
  billingCycle: z.enum(['monthly', 'yearly']),
})

export type ChangePlanInput = z.infer<typeof changePlanSchema>

export type SubscribeInput = z.infer<typeof subscribeSchema>

// Payload do webhook do Asaas — só declaramos os campos que efetivamente
// usamos; o resto do corpo é ignorado (zod não é .strict() aqui de propósito).
export const webhookSchema = z.object({
  event: z.string(),
  payment: z
    .object({
      id: z.string(),
      subscription: z.string().optional(),
      value: z.number().optional(),
      status: z.string().optional(),
      dueDate: z.string().optional(),
      invoiceUrl: z.string().optional(),
      clientPaymentDate: z.string().optional(),
    })
    .optional(),
})

export type WebhookInput = z.infer<typeof webhookSchema>
