import { env } from '../env'
import { AppError } from './errors'

/**
 * Cliente da Bunny.net Edge Storage. Segue o mesmo padrão do asaasClient:
 * fetch nativo com o segredo vindo do env e erros mapeados para AppError.
 *
 * Fluxo: os bytes são gravados na Storage Zone (bunnyPut) e servidos ao público
 * pela Pull Zone (BUNNY_CDN_URL). A AccessKey nunca sai do backend.
 */

function normalizedCdnBase(): string | null {
  if (!env.BUNNY_CDN_URL) return null
  return env.BUNNY_CDN_URL.replace(/\/+$/, '')
}

/** Todas as credenciais presentes? Sem elas o upload fica indisponível (503). */
export function isBunnyConfigured(): boolean {
  return Boolean(
    env.BUNNY_STORAGE_ENDPOINT &&
      env.BUNNY_STORAGE_ZONE &&
      env.BUNNY_STORAGE_PASSWORD &&
      env.BUNNY_CDN_URL,
  )
}

function assertConfigured(): void {
  if (!isBunnyConfigured()) {
    throw new AppError('Upload de imagens indisponível no momento', 503)
  }
}

function storageUrl(path: string): string {
  const endpoint = env.BUNNY_STORAGE_ENDPOINT!.replace(/\/+$/, '')
  return `${endpoint}/${env.BUNNY_STORAGE_ZONE}/${path}`
}

/** Grava os bytes na Storage Zone e devolve a URL pública (Pull Zone). */
export async function bunnyPut(
  path: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  assertConfigured()
  let response: Response
  try {
    response = await fetch(storageUrl(path), {
      method: 'PUT',
      headers: {
        AccessKey: env.BUNNY_STORAGE_PASSWORD!,
        'Content-Type': contentType,
      },
      body,
    })
  } catch {
    throw new AppError('Falha ao enviar a imagem para o armazenamento', 502)
  }
  if (!response.ok) {
    throw new AppError(
      'Falha ao enviar a imagem para o armazenamento',
      response.status >= 500 ? 502 : 400,
    )
  }
  return `${normalizedCdnBase()}/${path}`
}

/**
 * Apaga um arquivo a partir da sua URL pública. Best-effort e ESCOPADO ao tenant:
 * como o storage é plano (sem pastas), a posse é verificada pelo sufixo do nome
 * (`...-<establishmentId>.<ext>`). Isso impede um `replaces` forjado de apagar
 * imagem de outro estabelecimento (IDOR). Também exige arquivo na raiz (sem
 * subpasta) e rejeita path traversal ('..', inclusive percent-encoded). Nunca
 * propaga erro: a limpeza do arquivo antigo não deve derrubar o upload novo.
 */
export async function bunnyDeleteByUrl(
  url: string | null | undefined,
  establishmentId: string,
): Promise<void> {
  if (!url || !isBunnyConfigured() || !establishmentId) return
  const base = normalizedCdnBase()
  if (!base || !url.startsWith(`${base}/`)) return
  const path = url.slice(base.length + 1)

  // Arquivo na raiz (sem subpasta/traversal) e do próprio tenant (nome termina
  // em `-<establishmentId>.<ext>`). Nossos nomes reais passam; forjados, não.
  if (!path || path.includes('/')) return
  let decoded: string
  try {
    decoded = decodeURIComponent(path)
  } catch {
    return
  }
  if (decoded.includes('/') || decoded.includes('..')) return
  const nameWithoutExt = decoded.replace(/\.[^.]+$/, '')
  if (!nameWithoutExt.endsWith(`-${establishmentId}`)) return

  try {
    await fetch(storageUrl(path), {
      method: 'DELETE',
      headers: { AccessKey: env.BUNNY_STORAGE_PASSWORD! },
    })
  } catch {
    // Limpeza best-effort: se falhar, o arquivo antigo apenas fica órfão.
  }
}
