import 'dotenv/config'
import pg from 'pg'

const url = new URL(process.env.DATABASE_URL ?? 'postgres://postgres:803060@localhost:5432/agendadb')
const targetDb = url.pathname.replace(/^\//, '')
url.pathname = '/postgres'

const client = new pg.Client({ connectionString: url.toString() })

async function main() {
  await client.connect()
  const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [targetDb])
  if (exists.rowCount === 0) {
    await client.query(`CREATE DATABASE "${targetDb}"`)
    console.log(`Banco "${targetDb}" criado.`)
  } else {
    console.log(`Banco "${targetDb}" já existe.`)
  }
  await client.end()
}

main().catch((err) => {
  console.error('Falha ao criar banco:', err.message)
  process.exit(1)
})
