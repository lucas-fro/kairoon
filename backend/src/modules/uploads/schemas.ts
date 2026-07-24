import { z } from 'zod'

/**
 * kind escolhe a pasta e o gate de plano; replaces (opcional) é a URL da imagem
 * atual, apagada após o upload novo (troca sem deixar órfão). Vêm na query
 * porque o corpo é o arquivo binário (multipart).
 */
export const uploadImageQuerySchema = z.object({
  kind: z.enum(['logo', 'banner', 'photo']),
  replaces: z.string().url().optional(),
})

export type UploadImageQuery = z.infer<typeof uploadImageQuerySchema>
