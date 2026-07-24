/**
 * Redimensiona a imagem NO NAVEGADOR antes do upload, para não trafegar arquivo
 * pesado (foto de celular passa fácil de 8 MB). É best-effort e uma camada de
 * OTIMIZAÇÃO, nunca a garantia: o backend ainda redimensiona por tipo, valida e
 * converte pra WebP. Qualquer falha ou navegador sem suporte devolve o arquivo
 * original, e o backend cuida do resto. Também nunca piora a imagem: se o
 * resultado não ficar menor (imagem já pequena), devolve o original.
 *
 * Orientação: createImageBitmap com `imageOrientation: 'from-image'` aplica a
 * rotação do EXIF ao decodificar, então o canvas já desenha na posição certa (a
 * saída sai sem EXIF, "assada" na orientação correta). Fotos de celular que
 * guardam a rotação como metadado não ficam deitadas.
 */
export async function downscaleImageForUpload(
  file: File,
  maxEdge = 1600,
  quality = 0.8,
): Promise<File> {
  try {
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
      return file
    }

    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const { width, height } = bitmap
    if (!width || !height) {
      bitmap.close?.()
      return file
    }

    const scale = Math.min(1, maxEdge / Math.max(width, height))
    const targetW = Math.max(1, Math.round(width * scale))
    const targetH = Math.max(1, Math.round(height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = targetW
    canvas.height = targetH
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close?.()
      return file
    }
    ctx.imageSmoothingQuality = 'high'
    // Sem preencher fundo: mantém a transparência de logos PNG no WebP de saída.
    ctx.drawImage(bitmap, 0, 0, targetW, targetH)
    bitmap.close?.()

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/webp', quality)
    })

    // Canvas sem encode WebP (Safari antigo) ou falha: manda o original (preserva
    // a imagem intacta e deixa o backend converter).
    if (!blob || blob.type !== 'image/webp') return file
    // Já estava pequeno/otimizado: não troca por algo maior.
    if (blob.size >= file.size) return file

    const baseName = file.name.replace(/\.[^./\\]+$/, '') || 'imagem'
    return new File([blob], `${baseName}.webp`, { type: 'image/webp' })
  } catch {
    return file
  }
}
