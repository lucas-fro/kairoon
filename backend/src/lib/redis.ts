import { Redis } from 'ioredis'
import { env } from '../env'
import { AppError } from './errors'

/**
 * Conexão ioredis compartilhada por processo (a API e o worker sobem cada um a
 * sua). `maxRetriesPerRequest: null` é obrigatório para o Worker do BullMQ:
 * sem isso ele se recusa a iniciar, porque o comando bloqueante que ele usa
 * para esperar job não pode ter teto de retentativas.
 *
 * O listener de 'error' existe para que uma queda do Redis não vire
 * unhandled error e derrube o processo: o dispatcher é best-effort e a app
 * precisa continuar de pé sem fila.
 */
export const redisConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null })

redisConnection.on('error', (err) => console.error('[redis] connection error:', err.message))

/**
 * Executa um comando com teto de tempo, para uso DENTRO de uma request HTTP.
 *
 * Com o Redis fora, o ioredis não rejeita: ele guarda o comando numa fila
 * offline e só resolve quando a conexão volta. Sem este teto, uma requisição
 * que consulta o Redis fica pendurada indefinidamente em vez de responder.
 *
 * Só para caminhos em que o Redis é essencial (ex.: o código de acesso da
 * página de gerenciamento). Enfileirar notificação é best-effort e tem o
 * próprio timeout no dispatcher, que engole a falha em vez de propagar.
 */
export async function withRedisTimeout<T>(command: Promise<T>, ms = 2000): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      command,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new AppError('Serviço temporariamente indisponível. Tente novamente.', 503)),
          ms,
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
