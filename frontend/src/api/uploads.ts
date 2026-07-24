import { api } from './client'

export type UploadKind = 'logo' | 'banner' | 'photo'

/**
 * Sobe uma imagem para a Bunny CDN e devolve a URL pública. Não persiste nada:
 * o chamador grava a URL no campo certo (logoUrl / bannerImageUrl / photoUrl)
 * pelos endpoints de estabelecimento/profissional. `replaces` é a URL atual, que
 * o backend apaga após o upload novo (troca sem deixar arquivo órfão).
 */
export function uploadImage(kind: UploadKind, file: File, replaces?: string | null) {
  const form = new FormData()
  form.append('file', file)
  const params = new URLSearchParams({ kind })
  if (replaces) params.set('replaces', replaces)
  return api<{ url: string }>(`/uploads/image?${params.toString()}`, {
    method: 'POST',
    body: form,
  })
}
