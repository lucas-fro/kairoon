import { buildApp } from './app'
import { pool } from './db'
import { env } from './env'
import { closeQueues } from './queues'

const app = await buildApp()

try {
  await app.listen({ port: env.PORT, host: '0.0.0.0' })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

// Encerramento limpo (lacuna que existia antes das filas): sem isto, um deploy
// derruba requisições em voo e deixa conexões de Postgres/Redis penduradas.
let down = false
async function shutdown(signal: string) {
  if (down) return
  down = true
  app.log.info(`${signal} recebido, encerrando...`)
  try {
    await app.close()
    await closeQueues()
    await pool.end()
  } finally {
    process.exit(0)
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
