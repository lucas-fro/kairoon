import type { FastifyInstance } from 'fastify'
import * as dashboardService from './service'

export async function dashboardRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  // É a página inicial de qualquer sessão: em vez de exigir uma permissão e
  // deixar parte da equipe sem tela de entrada, o serviço devolve null nos
  // números que a pessoa não pode ver e escopa a agenda a quem só enxerga a
  // própria.
  app.get('/summary', { config: { permission: 'authenticated' } }, async (request) => {
    return dashboardService.getSummary(request.auth.establishmentId, request.auth)
  })
}
