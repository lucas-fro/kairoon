import { z } from 'zod'

export const pointsRewardTypeSchema = z.enum(['percent', 'fixed', 'free_service'])

export const upsertPointsProgramSchema = z.object({
  active: z.boolean(),
  pointsPerService: z.number().int().min(0, 'Pontos por atendimento inválidos').max(100000),
  pointsPerCurrencyUnit: z.number().int().min(0, 'Pontos por real inválidos').max(100000),
})

const rewardBaseSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome da recompensa').max(80, 'Nome muito longo'),
  costPoints: z.number().int().min(1, 'Informe o custo em pontos'),
  rewardType: pointsRewardTypeSchema,
  rewardValue: z.number().int().min(0, 'Valor inválido').default(0),
  // Um ou mais serviços elegíveis do 'free_service'. Vazio/ausente = qualquer serviço.
  rewardServiceIds: z.array(z.string().uuid('Serviço inválido')).nullable().optional(),
  active: z.boolean().default(true),
})

const assertRewardValue = (
  data: { rewardType: 'percent' | 'fixed' | 'free_service'; rewardValue: number },
  ctx: z.RefinementCtx,
) => {
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
}

export const createPointsRewardSchema = rewardBaseSchema.superRefine(assertRewardValue)
export const updatePointsRewardSchema = rewardBaseSchema.superRefine(assertRewardValue)

export const redeemPointsSchema = z.object({
  clientId: z.string().uuid('Cliente inválido'),
  rewardId: z.string().uuid('Recompensa inválida'),
})

export const idParamSchema = z.object({ id: z.string().uuid('Recompensa inválida') })
export const clientIdParamSchema = z.object({ clientId: z.string().uuid('Cliente inválido') })

export type UpsertPointsProgramInput = z.infer<typeof upsertPointsProgramSchema>
export type CreatePointsRewardInput = z.infer<typeof createPointsRewardSchema>
export type UpdatePointsRewardInput = z.infer<typeof updatePointsRewardSchema>
export type RedeemPointsInput = z.infer<typeof redeemPointsSchema>
