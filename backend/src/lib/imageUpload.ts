import { randomUUID } from 'node:crypto'
import type { MultipartFile } from '@fastify/multipart'
import type { FastifyRequest } from 'fastify'
import { AppError } from './errors'
import { bunnyDeleteByUrl, bunnyPut } from './bunnyStorage'

/** Teto de tamanho por imagem. Espelha o `limits.fileSize` do @fastify/multipart. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export type UploadKind = 'logo' | 'banner' | 'photo'

/** Pasta na Storage Zone por tipo de imagem. */
const FOLDERS: Record<UploadKind, string> = {
  logo: 'logos',
  banner: 'banners',
  photo: 'photos',
}

interface ValidatedImage {
  buffer: Buffer
  contentType: string
  ext: string
}

/**
 * Detecta o tipo real pela assinatura de bytes (magic number), ignorando o
 * Content-Type informado pelo cliente (falsificável). Só PNG, JPG e WEBP.
 */
function detectImageType(buf: Buffer): { contentType: string; ext: string } | null {
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return { contentType: 'image/png', ext: 'png' }
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { contentType: 'image/jpeg', ext: 'jpg' }
  }
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { contentType: 'image/webp', ext: 'webp' }
  }
  return null
}

/**
 * Lê o arquivo de um request multipart, respeitando o teto de tamanho e
 * validando que é mesmo uma imagem suportada. Lança AppError amigável.
 */
export async function readImageUpload(request: FastifyRequest): Promise<ValidatedImage> {
  let file: MultipartFile | undefined
  try {
    file = await request.file()
  } catch {
    throw new AppError('Envio inválido: use um formulário multipart com um arquivo', 400)
  }
  if (!file) throw new AppError('Nenhum arquivo enviado', 400)

  let buffer: Buffer
  try {
    buffer = await file.toBuffer()
  } catch {
    // @fastify/multipart estoura ao ultrapassar limits.fileSize.
    throw new AppError('Imagem muito grande (máximo 5 MB)', 413)
  }
  if (file.file.truncated) {
    throw new AppError('Imagem muito grande (máximo 5 MB)', 413)
  }

  const detected = detectImageType(buffer)
  if (!detected) {
    throw new AppError('Formato inválido. Envie uma imagem PNG, JPG ou WEBP', 415)
  }
  return { buffer, contentType: detected.contentType, ext: detected.ext }
}

/**
 * Sobe a imagem para a Bunny e devolve a URL pública. O nome do arquivo é
 * único (randomUUID) para o CDN nunca servir uma versão em cache antiga, e o
 * caminho é namespaced por estabelecimento. Quando `replaces` aponta para um
 * arquivo nosso, ele é apagado depois (best-effort) para não acumular órfãos.
 */
export async function storeImage(opts: {
  establishmentId: string
  kind: UploadKind
  image: ValidatedImage
  replaces?: string | null
}): Promise<string> {
  // Prefixo do tenant: usado tanto no caminho novo quanto para escopar a exclusão
  // do arquivo antigo (só apaga o que é do próprio estabelecimento).
  const tenantPrefix = `${FOLDERS[opts.kind]}/${opts.establishmentId}/`
  const path = `${tenantPrefix}${randomUUID()}.${opts.image.ext}`
  const url = await bunnyPut(path, opts.image.buffer, opts.image.contentType)
  if (opts.replaces) await bunnyDeleteByUrl(opts.replaces, tenantPrefix)
  return url
}
