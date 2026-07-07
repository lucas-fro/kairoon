import { z } from 'zod'

export const loyaltyRewardTypeSchema = z.enum(['free_service', 'percent', 'fixed'])

export const upsertLoyaltyProgramSchema = z
  .object({
    active: z.boolean(),
    stampsRequired: z.number().int().min(1, 'Mínimo de 1 carimbo').max(100, 'Máximo de 100 carimbos'),
    minTicketCents: z.number().int().min(0, 'Valor mínimo inválido'),
    rewardType: loyaltyRewardTypeSchema,
    rewardValue: z.number().int().min(0, 'Valor inválido').default(0),
    rewardServiceId: z.string().uuid('Serviço inválido').nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.rewardType === 'percent' && (data.rewardValue < 1 || data.rewardValue > 100)) {
      ctx.addIssue({
        code: 'custom',
        message: 'A porcentagem deve estar entre 1 e 100',
        path: ['rewardValue'],
      })
    }
    if (data.rewardType === 'fixed' && data.rewardValue < 1) {
      ctx.addIssue({ code: 'custom', message: 'Informe o valor do desconto', path: ['rewardValue'] })
    }
  })

export const redeemLoyaltySchema = z.object({
  clientId: z.string().uuid('Cliente inválido'),
})

export const clientIdParamSchema = z.object({ clientId: z.string().uuid('Cliente inválido') })

export type UpsertLoyaltyProgramInput = z.infer<typeof upsertLoyaltyProgramSchema>
export type RedeemLoyaltyInput = z.infer<typeof redeemLoyaltySchema>
