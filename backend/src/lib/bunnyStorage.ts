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
 * só apaga se o caminho estiver dentro de `requiredPrefix` (ex.: `logos/<estId>/`),
 * o que impede um `replaces` forjado de apagar imagem de outro estabelecimento
 * (IDOR) ou de varrer um diretório inteiro. Também rejeita barra final e path
 * traversal ('..', inclusive percent-encoded). Nunca propaga erro: a limpeza do
 * arquivo antigo não deve derrubar o upload novo, que já deu certo.
 */
export async function bunnyDeleteByUrl(
  url: string | null | undefined,
  requiredPrefix: string,
): Promise<void> {
  if (!url || !isBunnyConfigured()) return
  const base = normalizedCdnBase()
  if (!base || !url.startsWith(`${base}/`)) return
  const path = url.slice(base.length + 1)

  // O arquivo tem que ser do próprio tenant e ser um único nome (sem subpasta,
  // sem barra final, sem traversal). Nossos caminhos reais são
  // `${prefix}${uuid}.${ext}`, então só eles passam.
  if (!requiredPrefix || !path.startsWith(requiredPrefix)) return
  const filename = path.slice(requiredPrefix.length)
  let decoded: string
  try {
    decoded = decodeURIComponent(filename)
  } catch {
    return
  }
  if (
    !filename ||
    filename.includes('/') ||
    decoded.includes('/') ||
    decoded.includes('..')
  ) {
    return
  }

  try {
    await fetch(storageUrl(path), {
      method: 'DELETE',
      headers: { AccessKey: env.BUNNY_STORAGE_PASSWORD! },
    })
  } catch {
    // Limpeza best-effort: se falhar, o arquivo antigo apenas fica órfão.
  }
}
