import { z } from 'zod'

/**
 * kind escolhe o rótulo do arquivo e o gate de plano. Vem na query porque o
 * corpo é o arquivo binário (multipart). A imagem substituída é apagada pelo
 * serviço que grava a URL nova, não aqui (ver lib/imageUpload#storeImage).
 */
export const uploadImageQuerySchema = z.object({
  kind: z.enum(['logo', 'banner']),
})

export type UploadImageQuery = z.infer<typeof uploadImageQuerySchema>
