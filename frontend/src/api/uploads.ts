import { api } from './client'

export type UploadKind = 'logo' | 'banner'

/**
 * Sobe uma imagem para a Bunny CDN e devolve a URL pública. Não persiste nada:
 * o chamador grava a URL no campo certo (logoUrl / bannerImageUrl) pelo
 * endpoint de estabelecimento. A imagem substituída é
 * apagada pelo backend quando a URL nova é gravada, então não há nada a
 * informar aqui.
 */
export function uploadImage(kind: UploadKind, file: File) {
  const form = new FormData()
  form.append('file', file)
  return api<{ url: string }>(`/uploads/image?kind=${kind}`, {
    method: 'POST',
    body: form,
  })
}
