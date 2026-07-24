import { eq } from 'drizzle-orm'
import type { MultipartFile } from '@fastify/multipart'
import type { FastifyRequest } from 'fastify'
import { db } from '../db'
import { establishments } from '../db/schema'
import { AppError } from './errors'
import { bunnyDeleteByUrl, bunnyPut } from './bunnyStorage'

/** Teto de tamanho por imagem. Espelha o `limits.fileSize` do @fastify/multipart. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export type UploadKind = 'logo' | 'banner' | 'photo'

/** Rótulo do tipo usado no nome do arquivo (foto de profissional = "perfil"). */
const KIND_LABELS: Record<UploadKind, string> = {
  logo: 'logo',
  banner: 'banner',
  photo: 'perfil',
}

/** Deixa o slug seguro para nome de arquivo (só a-z 0-9 e hífen, curto). */
function fileNameSlug(slug: string | null | undefined): string {
  const clean = (slug ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return clean || 'estabelecimento'
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
 * Sobe a imagem para a Bunny (estrutura PLANA, sem pastas) e devolve a URL
 * pública. Nome: `<slug>-<tipo>-<timestamp>-<establishmentId>.<ext>`. O timestamp
 * garante nome único (o CDN nunca serve cache antigo) e o establishmentId no
 * final marca o dono, o que permite apagar o arquivo antigo só do próprio tenant
 * (ver bunnyDeleteByUrl). Quando `replaces` aponta para um arquivo nosso do mesmo
 * tenant, ele é apagado depois (best-effort) para não acumular órfãos.
 */
export async function storeImage(opts: {
  establishmentId: string
  kind: UploadKind
  image: ValidatedImage
  replaces?: string | null
}): Promise<string> {
  const est = await db.query.establishments.findFirst({
    columns: { slug: true },
    where: eq(establishments.id, opts.establishmentId),
  })
  const slug = fileNameSlug(est?.slug)
  const filename = `${slug}-${KIND_LABELS[opts.kind]}-${Date.now()}-${opts.establishmentId}.${opts.image.ext}`
  const url = await bunnyPut(filename, opts.image.buffer, opts.image.contentType)
  if (opts.replaces) await bunnyDeleteByUrl(opts.replaces, opts.establishmentId)
  return url
}
