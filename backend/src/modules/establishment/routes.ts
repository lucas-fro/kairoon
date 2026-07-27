import type { FastifyInstance } from 'fastify'
import {
  createTimeBlockSchema,
  slugAvailabilityQuerySchema,
  timeBlockIdParamSchema,
  updateEstablishmentSchema,
  updateSlugSchema,
  updateWorkingHoursSchema,
} from './schemas'
import * as establishmentService from './service'

export async function establishmentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  // Nome, logo e paleta do negócio: qualquer sessão precisa para desenhar o
  // painel. Editar é que exige settings.manage.
  app.get('/', { config: { permission: 'authenticated' } }, async (request) => {
    return establishmentService.getEstablishment(request.auth.establishmentId)
  })

  app.put('/', { config: { permission: 'settings.manage' } }, async (request) => {
    const input = updateEstablishmentSchema.parse(request.body)
    return establishmentService.updateEstablishment(request.auth.establishmentId, input)
  })

  app.put('/slug', { config: { permission: 'settings.manage' } }, async (request) => {
    const { slug } = updateSlugSchema.parse(request.body)
    return establishmentService.updateSlug(request.auth.establishmentId, slug)
  })

  app.get('/slug-availability', { config: { permission: 'settings.manage' } }, async (request) => {
    const { slug } = slugAvailabilityQuerySchema.parse(request.query)
    const available = await establishmentService.checkSlugAvailability(
      request.auth.establishmentId,
      slug,
    )
    return { available }
  })

  // O expediente define os horários que a agenda desenha: leitura para todos.
  app.get('/working-hours', { config: { permission: 'authenticated' } }, async (request) => {
    return establishmentService.listWorkingHours(request.auth.establishmentId)
  })

  app.put('/working-hours', { config: { permission: 'settings.manage' } }, async (request) => {
    const input = updateWorkingHoursSchema.parse(request.body)
    return establishmentService.updateWorkingHours(request.auth.establishmentId, input)
  })

  // Bloqueios são agenda, não configuração: quem cuida da agenda cria e remove
  // folga/pausa sem precisar de acesso às configurações do negócio.
  app.get('/time-blocks', { config: { permission: 'agenda.view' } }, async (request) => {
    return establishmentService.listTimeBlocks(request.auth.establishmentId)
  })

  app.post('/time-blocks', { config: { permission: 'agenda.edit' } }, async (request, reply) => {
    const input = createTimeBlockSchema.parse(request.body)
    const block = await establishmentService.createTimeBlock(request.auth.establishmentId, input)
    return reply.status(201).send(block)
  })

  app.delete(
    '/time-blocks/:id',
    { config: { permission: 'agenda.edit' } },
    async (request, reply) => {
      const { id } = timeBlockIdParamSchema.parse(request.params)
      await establishmentService.deleteTimeBlock(request.auth.establishmentId, id)
      return reply.status(204).send()
    },
  )

  // O mapa de features do plano gateia a UI inteira: todo mundo lê.
  app.get('/plan', { config: { permission: 'authenticated' } }, async (request) => {
    return establishmentService.getPlan(request.auth.establishmentId)
  })

  // Exclusão da própria conta (LGPD) continua liberada em somente-leitura, e é
  // só do dono: apaga o negócio inteiro, incluindo os acessos da equipe.
  app.delete(
    '/',
    { config: { permission: 'owner', allowWhenReadOnly: true } },
    async (request, reply) => {
      await establishmentService.deleteAccount(request.auth.userId)
      return reply.status(204).send()
    },
  )
}
