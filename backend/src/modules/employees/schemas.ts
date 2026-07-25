import { z } from 'zod'
import { DATE_REGEX, TIME_REGEX, isValidDateStr } from '../../lib/datetime'

// Campo de texto opcional: ausente → não altera, vazio → limpa (null)
const emptyToNull = <T extends z.ZodTypeAny>(schema: T) =>
  schema
    .or(z.literal(''))
    .transform((value) => (value === '' ? null : value))
    .optional()

export const createEmployeeSchema = z.object({
  name: z.string().min(2, 'Informe o nome do profissional (mínimo 2 caracteres)'),
  email: emptyToNull(z.string().trim().email('E-mail inválido')),
  phone: emptyToNull(z.string().trim().max(20, 'Telefone inválido')),
  birthDate: emptyToNull(
    z.string().regex(DATE_REGEX, 'Data inválida').refine(isValidDateStr, 'Data inválida'),
  ),
  gender: emptyToNull(z.enum(['masculino', 'feminino', 'outro'])),
  // Jornada de trabalho
  workStart: z.string().regex(TIME_REGEX, 'Horário de entrada inválido').optional(),
  workEnd: z.string().regex(TIME_REGEX, 'Horário de saída inválido').optional(),
  lunchStart: emptyToNull(z.string().regex(TIME_REGEX, 'Horário de almoço inválido')),
  lunchEnd: emptyToNull(z.string().regex(TIME_REGEX, 'Horário de almoço inválido')),
  workDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  // Não é coluna: se true, aplica a mesma jornada a todos os profissionais
  applyScheduleToAll: z.boolean().optional(),
  active: z.boolean().default(true),
  // Comissão: tipo e valores por serviço. value é porcentagem inteira (0–100)
  // quando commissionType='percent', ou centavos quando 'fixed'.
  commissionEnabled: z.boolean().optional(),
  commissionType: z.enum(['percent', 'fixed']).optional(),
  commissions: z
    .array(
      z.object({
        serviceId: z.string().uuid(),
        value: z.number().int().min(0).max(1_000_000),
      }),
    )
    .optional(),
  // Não é coluna: se true, replica a comissão para todos os profissionais
  applyCommissionToAll: z.boolean().optional(),
  // Folha de pagamento (para previsão de custos fixos / futura folha salarial)
  salaryCents: z.number().int().min(0, 'Salário inválido').nullable().optional(),
  bonuses: z
    .array(
      z.object({
        label: z.string().trim().max(60, 'Nome do bônus muito longo'),
        amountCents: z.number().int().min(0),
      }),
    )
    .max(20, 'Muitos bônus')
    .optional(),
  vrCents: z.number().int().min(0, 'VR inválido').nullable().optional(),
  vtCents: z.number().int().min(0, 'VT inválido').nullable().optional(),
  vaCents: z.number().int().min(0, 'VA inválido').nullable().optional(),
  // 1 ou 2 dias de pagamento, cada um com o valor pago naquele dia
  paymentDays: z
    .array(
      z.object({
        day: z.number().int().min(1, 'Dia inválido').max(31, 'Dia inválido'),
        amountCents: z.number().int().min(0),
      }),
    )
    .max(2, 'No máximo 2 dias de pagamento')
    .optional(),
})

export const updateEmployeeSchema = createEmployeeSchema.partial()

export const idParamSchema = z.object({ id: z.string().uuid() })

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>
