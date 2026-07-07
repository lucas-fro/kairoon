import { z } from 'zod'
import { DATE_REGEX, isValidDateStr } from '../../lib/datetime'

const dateStringSchema = (message: string) =>
  z.string().regex(DATE_REGEX, message).refine(isValidDateStr, message)

export const couponDiscountTypeSchema = z.enum(['percent', 'fixed', 'free_service'])
export const couponAppliesToSchema = z.enum(['total', 'service'])

// Código normalizado para maiúsculas (aplicação é case-insensitive)
const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{3,30}$/, 'Código inválido: use 3–30 letras, números ou hífen')

const couponBaseSchema = z.object({
  name: z.string().trim().max(80, 'Nome muito longo').optional(),
  discountType: couponDiscountTypeSchema,
  discountValue: z.number().int().min(0, 'Valor inválido').default(0),
  appliesTo: couponAppliesToSchema.default('total'),
  appliesToServiceIds: z.array(z.string().uuid('Serviço inválido')).max(100).optional(),
  minSpendCents: z.number().int().min(0, 'Valor mínimo inválido').default(0),
  maxDiscountCents: z.number().int().min(1, 'Teto de desconto inválido').nullable().optional(),
  validFrom: dateStringSchema('Data inicial inválida').nullable().optional(),
  validUntil: dateStringSchema('Data final inválida').nullable().optional(),
  maxUses: z.number().int().min(1, 'Limite de usos inválido').nullable().optional(),
  usesPerClient: z.number().int().min(1, 'Usos por cliente inválido').default(1),
  firstVisitOnly: z.boolean().default(false),
  active: z.boolean().default(true),
})

// source restrito a manual/campaign: cupons 'loyalty'/'points' são cunhados
// internamente pelos programas, nunca criados pela API.
export const createCouponSchema = couponBaseSchema
  .extend({
    source: z.enum(['manual', 'campaign']).default('manual'),
    code: codeSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.source === 'manual' && !data.code) {
      ctx.addIssue({ code: 'custom', message: 'Informe o código do cupom', path: ['code'] })
    }
    if (data.source === 'campaign' && !data.name?.trim()) {
      ctx.addIssue({ code: 'custom', message: 'Informe o nome da campanha', path: ['name'] })
    }
  })

export const updateCouponSchema = couponBaseSchema.partial().extend({
  code: codeSchema.optional(),
})

export const listCouponsQuerySchema = z.object({
  source: z.enum(['manual', 'campaign']).optional(),
})

// Preview do checkout: com code valida o cupom digitado (erro explica o
// motivo); sem code retorna a melhor campanha autoApply que casar (ou null).
export const validateCouponSchema = z.object({
  code: codeSchema.optional(),
  clientId: z.string().uuid('Cliente inválido'),
  serviceId: z.string().uuid('Serviço inválido'),
  subtotalCents: z.number().int().min(0, 'Subtotal inválido'),
  date: dateStringSchema('Data inválida'),
  appointmentId: z.string().uuid('Agendamento inválido').optional(),
})

export const idParamSchema = z.object({ id: z.string().uuid('Cupom inválido') })
export const clientIdParamSchema = z.object({ clientId: z.string().uuid('Cliente inválido') })

export type CreateCouponInput = z.infer<typeof createCouponSchema>
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>
export type ListCouponsQuery = z.infer<typeof listCouponsQuerySchema>
export type ValidateCouponInput = z.infer<typeof validateCouponSchema>
