import 'dotenv/config'
import pg from 'pg'

/**
 * Apaga TODOS os dados do banco (reset), mantendo a estrutura das tabelas e o
 * histórico de migrations do Drizzle. Depois de rodar, o banco fica vazio e o
 * app funciona na hora, sem precisar migrar de novo.
 *
 * Uso (dentro da VPS, na pasta do backend):
 *   npm run db:reset -- --yes
 *
 * Sem o --yes ele só mostra o que faria e sai, sem tocar em nada. É destrutivo
 * e irreversível: confira o banco alvo impresso antes de confirmar.
 */

const connectionString =
  process.env.DATABASE_URL ?? 'postgres://postgres:803060@localhost:5432/agendadb'

// Tabelas de controle do Drizzle: nunca truncar (perderia o histórico de
// migrations e o app pediria pra migrar tudo de novo).
const PROTECTED_TABLES = new Set(['__drizzle_migrations'])

const confirmed = process.argv.slice(2).some((arg) => arg === '--yes' || arg === '-y')

function describeTarget(): string {
  try {
    const url = new URL(connectionString)
    const database = url.pathname.replace(/^\//, '') || '(padrão)'
    return `${database} @ ${url.host}`
  } catch {
    return '(não foi possível ler o DATABASE_URL)'
  }
}

async function main() {
  const client = new pg.Client({ connectionString })
  await client.connect()
  try {
    const { rows } = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    )
    const tables = rows.map((r) => r.tablename).filter((t) => !PROTECTED_TABLES.has(t))

    if (tables.length === 0) {
      console.log(`Nenhuma tabela de dados encontrada em ${describeTarget()}. Nada a fazer.`)
      return
    }

    console.log(`Banco alvo: ${describeTarget()}`)
    console.log(`Tabelas que serão esvaziadas (${tables.length}):`)
    console.log(`  ${tables.sort().join(', ')}`)

    if (!confirmed) {
      console.log('')
      console.log('Isto APAGA todos os dados dessas tabelas (irreversível).')
      console.log('Para confirmar, rode de novo com --yes:')
      console.log('  npm run db:reset -- --yes')
      return
    }

    // RESTART IDENTITY zera sequências; CASCADE resolve as dependências de FK
    // truncando tudo numa única operação, na ordem certa.
    const list = tables.map((t) => `"${t}"`).join(', ')
    await client.query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)

    console.log('')
    console.log(`Pronto: ${tables.length} tabelas esvaziadas. O banco foi resetado.`)
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('Falha ao resetar o banco:', err instanceof Error ? err.message : err)
  process.exit(1)
})
