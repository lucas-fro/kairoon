import type { FastifyInstance } from 'fastify'
import { subscribe } from '../../lib/events'
import type { AuthContext, AuthTokenPayload } from '../../plugins/auth'
import { resolveAuthContext } from '../../plugins/auth'

/** Evento do barramento que carrega um agendamento (o único hoje). */
type AppointmentEvent = { appointment?: { employeeId?: string } }

/**
 * O ouvinte pode receber este evento? Quem não enxerga a agenda dos outros não
 * pode ser avisado de agendamento que não é dele: o popup em tempo real
 * vazaria justamente o que a listagem esconde.
 */
function canReceive(auth: AuthContext, event: unknown): boolean {
  if (!auth.permissions.has('agenda.view')) return false
  if (auth.agendaScopeEmployeeId === null) return true
  const employeeId = (event as AppointmentEvent)?.appointment?.employeeId
  return employeeId === auth.agendaScopeEmployeeId
}

/**
 * Stream de eventos em tempo real (SSE). Como o EventSource do navegador não
 * envia cabeçalho Authorization, o token JWT vem por query string: por isso a
 * rota é 'public' no gate global e faz a própria verificação aqui.
 */
export async function realtimeRoutes(app: FastifyInstance) {
  app.get('/stream', { config: { permission: 'public' } }, async (request, reply) => {
    const token = (request.query as { token?: string }).token
    if (!token) return reply.status(401).send({ message: 'Token ausente' })

    let payload: AuthTokenPayload
    try {
      payload = app.jwt.verify<AuthTokenPayload>(token)
    } catch {
      return reply.status(401).send({ message: 'Token inválido' })
    }

    // Mesma resolução do gate global: conta/ficha desativada não abre stream, e
    // as permissões saem do banco (nunca do token).
    let auth: AuthContext
    try {
      auth = await resolveAuthContext(payload)
    } catch {
      return reply.status(401).send({ message: 'Não autorizado' })
    }
    if (!auth.permissions.has('agenda.view')) {
      return reply.status(403).send({ message: 'Sem permissão para acompanhar a agenda' })
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

    // `current` em vez do `auth` congelado da conexão: um stream fica aberto por
    // horas, e revogar acesso (ou mudar permissão) precisa valer aqui também,
    // não só na próxima requisição HTTP.
    let current = auth
    const unsubscribe = subscribe(auth.establishmentId, (event) => {
      if (!canReceive(current, event)) return
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
    })

    const close = () => {
      clearInterval(heartbeat)
      unsubscribe()
      reply.raw.end()
    }

    // O heartbeat já roda de tempos em tempos: aproveitamos para revalidar.
    const heartbeat = setInterval(() => {
      resolveAuthContext(payload)
        .then((fresh) => {
          if (!fresh.permissions.has('agenda.view')) return close()
          current = fresh
          reply.raw.write(': ping\n\n')
        })
        .catch(close)
    }, 25000)

    request.raw.on('close', () => {
      clearInterval(heartbeat)
      unsubscribe()
    })

    reply.hijack()
  })
}
