import { z } from 'zod'

const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/

export const createRecurringExpenseSchema = z.object({
  description: z
    .string()
    .trim()
    .min(2, 'Descrição deve ter no mínimo 2 caracteres')
    .max(120, 'Descrição muito longa'),
  amountCents: z.number().int('Valor deve ser inteiro em centavos').min(1, 'Valor mínimo de 1 centavo'),
  dayOfMonth: z
    .number()
    .int('Dia inválido')
    .min(1, 'O dia deve ser entre 1 e 31')
    .max(31, 'O dia deve ser entre 1 e 31'),
  active: z.boolean().optional(),
})

export const updateRecurringExpenseSchema = createRecurringExpenseSchema.partial()

export const monthQuerySchema = z.object({
  month: z.string().regex(MONTH_REGEX, 'Mês inválido (use YYYY-MM)').optional(),
})

export const settleSchema = z.object({
  month: z.string().regex(MONTH_REGEX, 'Mês inválido (use YYYY-MM)'),
})

export const settlePayrollSchema = z.object({
  employeeId: z.string().uuid('Profissional inválido'),
  month: z.string().regex(MONTH_REGEX, 'Mês inválido (use YYYY-MM)'),
  day: z.number().int('Dia inválido').min(1, 'Dia inválido').max(31, 'Dia inválido'),
})

export const idParamSchema = z.object({ id: z.string().uuid('Identificador inválido') })

export type CreateRecurringExpenseInput = z.infer<typeof createRecurringExpenseSchema>
export type UpdateRecurringExpenseInput = z.infer<typeof updateRecurringExpenseSchema>
export type MonthQuery = z.infer<typeof monthQuerySchema>
export type SettleInput = z.infer<typeof settleSchema>
