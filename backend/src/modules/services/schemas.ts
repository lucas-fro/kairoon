import { z } from 'zod'

const durationSchema = z
  .number()
  .int()
  .min(5, 'Duração mínima de 5 minutos')
  .max(1440, 'Duração máxima de 24 horas')

export const createServiceSchema = z
  .object({
    name: z.string().min(1, 'Informe o nome do serviço'),
    active: z.boolean().default(true),
    isPackage: z.boolean().default(false),
    // Serviço simples
    durationMinutes: durationSchema.optional(),
    priceCents: z.number().int().min(0, 'Preço inválido').optional(),
    // Pacote
    packageServiceIds: z.array(z.string().uuid('Serviço inválido')).optional(),
    packageDiscountType: z.enum(['percent', 'fixed']).optional(),
    packageDiscountValue: z.number().int().min(0, 'Desconto inválido').optional(),
  })
  .refine((d) => d.isPackage || (d.durationMinutes !== undefined && d.priceCents !== undefined), {
    message: 'Informe a duração e o preço do serviço',
    path: ['priceCents'],
  })
  .refine((d) => !d.isPackage || (d.packageServiceIds?.length ?? 0) >= 2, {
    message: 'Um pacote precisa de pelo menos 2 serviços',
    path: ['packageServiceIds'],
  })
  .refine(
    (d) =>
      !d.isPackage || (d.packageDiscountType !== undefined && d.packageDiscountValue !== undefined),
    { message: 'Informe o tipo e o valor do desconto', path: ['packageDiscountValue'] },
  )
  .refine(
    (d) =>
      !(d.isPackage && d.packageDiscountType === 'percent') || (d.packageDiscountValue ?? 0) <= 100,
    { message: 'A porcentagem deve ser no máximo 100', path: ['packageDiscountValue'] },
  )

// Update não tem refine cruzado (recalculado no service conforme os campos enviados)
export const updateServiceSchema = z.object({
  name: z.string().min(1, 'Informe o nome do serviço').optional(),
  active: z.boolean().optional(),
  isPackage: z.boolean().optional(),
  durationMinutes: durationSchema.optional(),
  priceCents: z.number().int().min(0, 'Preço inválido').optional(),
  packageServiceIds: z.array(z.string().uuid('Serviço inválido')).optional(),
  packageDiscountType: z.enum(['percent', 'fixed']).optional(),
  packageDiscountValue: z.number().int().min(0, 'Desconto inválido').optional(),
})

export const idParamSchema = z.object({ id: z.string().uuid() })

export type CreateServiceInput = z.infer<typeof createServiceSchema>
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>
