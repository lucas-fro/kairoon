import 'dotenv/config'
import pg from 'pg'

/**
 * Varre a Storage Zone da Bunny e remove imagens ÓRFÃS: arquivos que nenhum
 * registro do banco referencia (hoje, logo e banner do estabelecimento).
 *
 * Órfãos aparecem por caminhos que o app não cobre no momento da ação, por
 * exemplo o upload feito e depois abandonado sem salvar o formulário, ou
 * arquivos que sobraram de antes de a limpeza automática existir. A troca, a
 * remoção e a exclusão de conta já apagam sozinhas (ver lib/bunnyStorage.ts).
 *
 * Uso (na pasta do backend):
 *   npm run bunny:gc            mostra o que seria apagado, sem tocar em nada
 *   npm run bunny:gc -- --yes   apaga de verdade
 *
 * É destrutivo e irreversível com --yes: rode antes sem a flag e confira a
 * lista. Um arquivo recém-subido e ainda não salvo aparece como órfão, então
 * evite rodar com --yes enquanto alguém está editando imagens.
 *
 * ATENÇÃO AO BANCO ALVO: o que é órfão é decidido pelo DATABASE_URL carregado.
 * Rodar na máquina de desenvolvimento com as credenciais de produção da Bunny
 * apagaria as imagens de produção, porque o banco local não as referencia. Por
 * isso o script se recusa a apagar quando NENHUM arquivo da Storage Zone é
 * referenciado pelo banco: é o sintoma clássico de banco errado.
 */

const connectionString =
  process.env.DATABASE_URL ?? 'postgres://postgres:803060@localhost:5432/agendadb'

const endpoint = (process.env.BUNNY_STORAGE_ENDPOINT ?? '').replace(/\/+$/, '')
const zone = process.env.BUNNY_STORAGE_ZONE ?? ''
const accessKey = process.env.BUNNY_STORAGE_PASSWORD ?? ''
const cdnBase = (process.env.BUNNY_CDN_URL ?? '').replace(/\/+$/, '')

const args = process.argv.slice(2)
const confirmed = args.some((arg) => arg === '--yes' || arg === '-y')
/** Libera a trava de "nenhum arquivo em uso" (ver o cabeçalho deste arquivo). */
const forced = args.includes('--force')

interface BunnyEntry {
  ObjectName: string
  IsDirectory: boolean
  Length: number
}

function storageUrl(path: string): string {
  return `${endpoint}/${zone}/${path}`
}

async function bunnyList(path: string): Promise<BunnyEntry[]> {
  const response = await fetch(storageUrl(path), { headers: { AccessKey: accessKey } })
  if (response.status === 404) return []
  if (!response.ok) {
    throw new Error(`Falha ao listar "${path}": ${response.status} ${response.statusText}`)
  }
  return (await response.json()) as BunnyEntry[]
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function main() {
  if (!endpoint || !zone || !accessKey || !cdnBase) {
    console.error('Credenciais da Bunny ausentes no .env (BUNNY_STORAGE_* e BUNNY_CDN_URL).')
    process.exit(1)
  }

  const client = new pg.Client({ connectionString })
  await client.connect()

  // Toda URL que o banco referencia hoje. Qualquer arquivo fora deste conjunto
  // não é usado por ninguém.
  const referenced = new Set<string>()
  const { rows: estRows } = await client.query<{ logo_url: string | null; banner_image_url: string | null }>(
    'SELECT logo_url, banner_image_url FROM establishments',
  )
  for (const row of estRows) {
    if (row.logo_url) referenced.add(row.logo_url)
    if (row.banner_image_url) referenced.add(row.banner_image_url)
  }

  // Pastas cujo estabelecimento não existe mais: a conta foi excluída antes de a
  // limpeza automática existir, então a pasta inteira é órfã.
  const { rows: idRows } = await client.query<{ id: string }>('SELECT id FROM establishments')
  const liveEstablishments = new Set(idRows.map((r) => r.id))
  await client.end()

  console.log(`Banco:  ${connectionString.replace(/:\/\/[^@]*@/, '://***@')}`)
  console.log(`Bunny:  ${zone} (${cdnBase})`)
  console.log(`URLs referenciadas no banco: ${referenced.size}`)
  console.log('')

  const root = await bunnyList('')
  const orphans: { path: string; bytes: number; reason: string }[] = []
  let keptCount = 0

  for (const entry of root) {
    if (!entry.IsDirectory) {
      // Arquivo solto na raiz: anterior ao esquema de pasta por estabelecimento.
      const url = `${cdnBase}/${entry.ObjectName}`
      if (referenced.has(url)) keptCount++
      else orphans.push({ path: entry.ObjectName, bytes: entry.Length, reason: 'arquivo solto na raiz' })
      continue
    }

    const folder = entry.ObjectName
    const accountGone = !liveEstablishments.has(folder)
    for (const file of await bunnyList(`${folder}/`)) {
      if (file.IsDirectory) continue
      const path = `${folder}/${file.ObjectName}`
      const url = `${cdnBase}/${path}`
      if (referenced.has(url)) {
        keptCount++
        continue
      }
      orphans.push({
        path,
        bytes: file.Length,
        reason: accountGone ? 'estabelecimento não existe mais' : 'não referenciado',
      })
    }
  }

  const totalBytes = orphans.reduce((sum, o) => sum + o.bytes, 0)
  console.log(`Arquivos em uso:  ${keptCount}`)
  console.log(`Arquivos órfãos:  ${orphans.length} (${formatBytes(totalBytes)})`)
  console.log('')

  if (orphans.length === 0) {
    console.log('Nada a limpar.')
    return
  }

  for (const orphan of orphans) {
    console.log(`  ${orphan.path}  [${formatBytes(orphan.bytes)}]  ${orphan.reason}`)
  }
  console.log('')

  if (!confirmed) {
    console.log('Nada foi apagado. Rode com "-- --yes" para apagar os arquivos acima.')
    return
  }

  // Trava de banco errado: se nada na Storage Zone é usado por este banco, ou o
  // DATABASE_URL não é o dono desta zona (dev apontando pra Bunny de produção),
  // ou o banco está vazio. Nos dois casos, apagar tudo seria desastroso.
  if (keptCount === 0 && !forced) {
    console.error('ABORTADO: nenhum arquivo desta Storage Zone é referenciado pelo banco acima.')
    console.error('Isso normalmente significa DATABASE_URL apontando para o banco errado.')
    console.error('Confirme que é o banco que alimenta esta zona e, se for mesmo, use --force.')
    process.exit(1)
  }

  let deleted = 0
  for (const orphan of orphans) {
    const response = await fetch(storageUrl(orphan.path), {
      method: 'DELETE',
      headers: { AccessKey: accessKey },
    })
    if (response.ok || response.status === 404) {
      deleted++
    } else {
      console.error(`  falha em ${orphan.path}: ${response.status} ${response.statusText}`)
    }
  }
  console.log(`Apagados ${deleted} de ${orphans.length} arquivos (${formatBytes(totalBytes)}).`)
}

main().catch((err) => {
  console.error('Falha na limpeza:', err)
  process.exit(1)
})
