import type { FastifyInstance } from 'fastify'
import { readImageUpload, storeImage } from '../../lib/imageUpload'
import { assertFeature } from '../../lib/plan'
import { uploadImageQuerySchema } from './schemas'

export async function uploadsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  /**
   * Recebe uma imagem (multipart) e devolve a URL pública na Bunny CDN. Não
   * persiste nada: o frontend grava a URL no campo certo (logoUrl /
   * bannerImageUrl) pelo endpoint de estabelecimento. Banner segue o gate de
   * plano `personalizacao` (logo é liberado em qualquer plano, como hoje).
   * É um POST mutante, então o gate global de somente-leitura já barra contas
   * com teste expirado.
   */
  app.post('/image', {
    // Cada upload grava um objeto novo na Storage Zone (nome único, sem
    // sobrescrever), então limita a taxa para conter abuso de storage/custo.
    // O `kind` aceito hoje é só logo e banner, ambos aparência do
    // estabelecimento, daí o gate único. Quando entrar foto de profissional,
    // ela deve exigir 'employees.manage' e a checagem passa a ser por kind
    // dentro do handler.
    config: { permission: 'settings.manage', rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request) => {
    const { kind } = uploadImageQuerySchema.parse(request.query)
    if (kind === 'banner') {
      await assertFeature(request.user.establishmentId, 'personalizacao')
    }
    const image = await readImageUpload(request)
    const url = await storeImage({
      establishmentId: request.user.establishmentId,
      kind,
      image,
    })
    return { url }
  })
}
