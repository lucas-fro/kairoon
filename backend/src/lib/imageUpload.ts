import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import type { MultipartFile } from '@fastify/multipart'
import type { FastifyRequest } from 'fastify'
import { db } from '../db'
import { establishments } from '../db/schema'
import { AppError } from './errors'
import { bunnyPut } from './bunnyStorage'

/** Teto de tamanho por imagem. Espelha o `limits.fileSize` do @fastify/multipart. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export type UploadKind = 'logo' | 'banner'

/** Rótulo do tipo usado no nome do arquivo. */
const KIND_LABELS: Record<UploadKind, string> = {
  logo: 'logo',
  banner: 'banner',
}

/**
 * Dimensão máxima (px) por tipo. `fit: inside` reduz mantendo proporção e nunca
 * corta nem amplia; o corte final (círculo do logo/foto, faixa do banner) fica a
 * cargo do object-cover no frontend. Uma logo de vários MB vira dezenas de KB.
 */
const MAX_DIMENSIONS: Record<UploadKind, { width: number; height: number }> = {
  logo: { width: 512, height: 512 },
  banner: { width: 1600, height: 600 },
}

/**
 * Otimiza a imagem: corrige orientação (EXIF), redimensiona para o teto do tipo
 * e recomprime em WebP (bem menor que PNG/JPEG, suportado por todos os
 * navegadores alvo). Devolve sempre WebP.
 */
async function optimizeImage(
  buffer: Buffer,
  kind: UploadKind,
): Promise<{ buffer: Buffer; ext: string; contentType: string }> {
  const { width, height } = MAX_DIMENSIONS[kind]
  try {
    const out = await sharp(buffer)
      .rotate()
      .resize(width, height, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer()
    return { buffer: out, ext: 'webp', contentType: 'image/webp' }
  } catch {
    throw new AppError('Não foi possível processar a imagem enviada', 422)
  }
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
 * Otimiza e sobe a imagem para a Bunny numa PASTA por estabelecimento e devolve
 * a URL pública. Caminho: `<establishmentId>/<slug>-<tipo>-<timestamp>.webp`. A
 * pasta (id) isola o tenant (permite apagar tudo ao excluir a conta e escopa a
 * exclusão de arquivo), o timestamp garante nome único (o CDN nunca serve cache
 * velho) e o slug deixa legível.
 *
 * O upload NÃO apaga a imagem anterior: quem faz isso são os serviços que
 * gravam a URL (establishment.updateEstablishment, employees.updateEmployee),
 * depois de a troca ser efetivada no banco. Apagar aqui deixava o registro
 * apontando para um arquivo inexistente quando a gravação seguinte falhava.
 */
export async function storeImage(opts: {
  establishmentId: string
  kind: UploadKind
  image: ValidatedImage
}): Promise<string> {
  const est = await db.query.establishments.findFirst({
    columns: { slug: true },
    where: eq(establishments.id, opts.establishmentId),
  })
  const optimized = await optimizeImage(opts.image.buffer, opts.kind)
  const slug = fileNameSlug(est?.slug)
  const path = `${opts.establishmentId}/${slug}-${KIND_LABELS[opts.kind]}-${Date.now()}.${optimized.ext}`
  return bunnyPut(path, optimized.buffer, optimized.contentType)
}
