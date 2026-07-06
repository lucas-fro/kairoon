import { z } from 'zod'

// Campo de texto opcional: ausente → não altera; vazio ('') ou null → limpa (null)
const emptyToNull = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .or(z.literal(''))
    .or(z.null())
    .transform((value) => (value === '' ? null : value))
    .optional()

export const createProductSchema = z.object({
  name: z.string().min(1, 'Informe o nome do produto'),
  priceCents: z.number().int().min(0, 'Preço inválido'),
  stockQuantity: z.number().int().min(0, 'Estoque inválido').default(0),
  active: z.boolean().default(true),
  // Opcionais
  brand: emptyToNull(60, 'Marca muito longa'),
  supplier: emptyToNull(80, 'Fornecedor muito longo'),
  description: emptyToNull(500, 'Descrição muito longa'),
  sku: emptyToNull(60, 'Código muito longo'),
  barcode: emptyToNull(60, 'Código de barras muito longo'),
  costCents: z.number().int().min(0, 'Custo inválido').nullable().optional(),
})

// Update explícito (sem defaults) para não reativar/zerar campos ausentes
export const updateProductSchema = z.object({
  name: z.string().min(1, 'Informe o nome do produto').optional(),
  priceCents: z.number().int().min(0, 'Preço inválido').optional(),
  stockQuantity: z.number().int().min(0, 'Estoque inválido').optional(),
  active: z.boolean().optional(),
  brand: emptyToNull(60, 'Marca muito longa'),
  supplier: emptyToNull(80, 'Fornecedor muito longo'),
  description: emptyToNull(500, 'Descrição muito longa'),
  sku: emptyToNull(60, 'Código muito longo'),
  barcode: emptyToNull(60, 'Código de barras muito longo'),
  costCents: z.number().int().min(0, 'Custo inválido').nullable().optional(),
})

export const idParamSchema = z.object({ id: z.string().uuid() })

export type CreateProductInput = z.infer<typeof createProductSchema>
export type UpdateProductInput = z.infer<typeof updateProductSchema>
