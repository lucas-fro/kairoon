import type { FastifyInstance } from 'fastify'
import { subscribe } from '../../lib/events'
import type { AuthTokenPayload } from '../../plugins/auth'

/**
 * Stream de eventos em tempo real (SSE). Como o EventSource do navegador não
 * envia cabeçalho Authorization, o token JWT vem por query string.
 */
export async function realtimeRoutes(app: FastifyInstance) {
  app.get('/stream', async (request, reply) => {
    const token = (request.query as { token?: string }).token
    if (!token) return reply.status(401).send({ message: 'Token ausente' })

    let payload: AuthTokenPayload
    try {
      payload = app.jwt.verify<AuthTokenPayload>(token)
    } catch {
      return reply.status(401).send({ message: 'Token inválido' })
    }

    const origin = request.headers.origin ?? '*'
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': origin,
      'X-Accel-Buffering': 'no',
    })
    reply.raw.write('retry: 5000\n\n')

    const unsubscribe = subscribe(payload.establishmentId, (event) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
    })
    const heartbeat = setInterval(() => {
      reply.raw.write(': ping\n\n')
    }, 25000)

    request.raw.on('close', () => {
      clearInterval(heartbeat)
      unsubscribe()
    })

    reply.hijack()
  })
}
