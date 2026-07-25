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
 * como cada estabelecimento tem sua pasta (`<establishmentId>/...`), a posse é a
 * própria pasta. Só apaga um arquivo DENTRO da pasta do tenant (impede `replaces`
 * forjado de apagar imagem de outro estabelecimento). Exige um único arquivo na
 * pasta (sem subpasta) e rejeita path traversal ('..', inclusive percent-encoded).
 * Nunca propaga erro: a limpeza do arquivo antigo não deve derrubar o upload novo.
 */
export async function bunnyDeleteByUrl(
  url: string | null | undefined,
  establishmentId: string,
): Promise<void> {
  if (!url || !isBunnyConfigured() || !establishmentId) return
  const base = normalizedCdnBase()
  if (!base || !url.startsWith(`${base}/`)) return
  const path = url.slice(base.length + 1)

  // Tem que estar na pasta do próprio tenant e ser um único arquivo (sem subpasta
  // nem traversal). O establishmentId é um uuid, então o prefixo é inequívoco.
  const prefix = `${establishmentId}/`
  if (!path.startsWith(prefix)) return
  const filename = path.slice(prefix.length)
  let decoded: string
  try {
    decoded = decodeURIComponent(filename)
  } catch {
    return
  }
  if (!filename || filename.includes('/') || decoded.includes('/') || decoded.includes('..')) {
    return
  }

  await bunnyDeletePath(path)
}

/**
 * DELETE cru na Storage Zone. Best-effort: nunca propaga erro (a limpeza do
 * arquivo antigo não pode derrubar a operação que a disparou), mas registra a
 * falha. Sem o log, um 401/404 do storage passava despercebido e o arquivo
 * ficava órfão sem nenhum rastro.
 */
async function bunnyDeletePath(path: string): Promise<boolean> {
  try {
    const response = await fetch(storageUrl(path), {
      method: 'DELETE',
      headers: { AccessKey: env.BUNNY_STORAGE_PASSWORD! },
    })
    // 404 = já não existe, o efeito desejado; não é falha.
    if (!response.ok && response.status !== 404) {
      console.error(`[bunny] falha ao apagar ${path}: ${response.status} ${response.statusText}`)
      return false
    }
    return true
  } catch (err) {
    console.error(`[bunny] erro de rede ao apagar ${path}:`, err)
    return false
  }
}

interface BunnyListEntry {
  ObjectName: string
  IsDirectory: boolean
}

/**
 * Apaga TODOS os arquivos da pasta de um estabelecimento (`<establishmentId>/`).
 * Usado na exclusão da conta: sem isto, logo, banner e fotos dos profissionais
 * continuavam públicos no CDN depois de a conta ser apagada do banco.
 * Best-effort e sempre escopado à pasta do tenant.
 */
export async function bunnyDeleteEstablishmentFolder(establishmentId: string): Promise<void> {
  if (!isBunnyConfigured() || !establishmentId) return
  // O id é um uuid gerado pelo banco; ainda assim, barra qualquer coisa fora
  // desse formato para nunca montar um path de listagem arbitrário.
  if (!/^[0-9a-f-]{36}$/i.test(establishmentId)) return

  let entries: BunnyListEntry[]
  try {
    const response = await fetch(storageUrl(`${establishmentId}/`), {
      headers: { AccessKey: env.BUNNY_STORAGE_PASSWORD! },
    })
    if (!response.ok) {
      // 404 = pasta inexistente (conta que nunca subiu imagem).
      if (response.status !== 404) {
        console.error(
          `[bunny] falha ao listar a pasta ${establishmentId}: ${response.status} ${response.statusText}`,
        )
      }
      return
    }
    entries = (await response.json()) as BunnyListEntry[]
  } catch (err) {
    console.error(`[bunny] erro ao listar a pasta ${establishmentId}:`, err)
    return
  }

  for (const entry of entries) {
    if (entry.IsDirectory || !entry.ObjectName || entry.ObjectName.includes('/')) continue
    await bunnyDeletePath(`${establishmentId}/${entry.ObjectName}`)
  }
}
