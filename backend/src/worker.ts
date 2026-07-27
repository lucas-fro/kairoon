import './env' // valida as variáveis no boot, igual ao server.ts
import { pool } from './db'
import { redisConnection } from './lib/redis'
import { closeQueues } from './queues'
import { startWorkers, stopWorkers } from './workers'

/**
 * Processo consumidor, separado da API de propósito: o Worker do BullMQ
 * estaciona uma conexão em comando bloqueante. Se dividissem processo, o
 * `queue.add()` da API sofreria latência e um throw no processamento poderia
 * derrubar o HTTP. Este entrypoint NUNCA importa buildApp().
 */

await startWorkers()
console.log('[worker] up, consumindo filas')

let down = false
async function shutdown(signal: string) {
  if (down) return
  down = true
  console.log(`[worker] ${signal} recebido, drenando...`)
  try {
    await stopWorkers()
    await closeQueues()
    await redisConnection.quit()
    await pool.end()
  } finally {
    process.exit(0)
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
