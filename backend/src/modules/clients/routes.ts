import type { FastifyInstance } from 'fastify'
import { AppError } from '../../lib/errors'
import { assertFeature } from '../../lib/plan'
import {
  createClientSchema,
  idParamSchema,
  lapsedQuerySchema,
  listClientsQuerySchema,
  updateClientSchema,
} from './schemas'
import * as clientsService from './service'

/** Mínimo de caracteres e teto de resultados do modo busca (só 'clients.lookup'). */
const LOOKUP_MIN_SEARCH_LENGTH = 2
const LOOKUP_MAX_RESULTS = 20

export async function clientsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  // Buscar um cliente para agendar não é o mesmo que folhear a carteira. Quem
  // tem só 'clients.lookup' (o profissional autônomo) precisa achar alguém que
  // já sabe o nome, então é obrigado a informar um termo e recebe uma fatia
  // curta. Com 'clients.view' a listagem completa continua como sempre foi.
  app.get('/', { config: { permission: 'clients.lookup' } }, async (request) => {
    const { search } = listClientsQuerySchema.parse(request.query)

    if (!request.auth.permissions.has('clients.view')) {
      if (!search || search.length < LOOKUP_MIN_SEARCH_LENGTH) {
        throw new AppError('Informe ao menos 2 caracteres para buscar o cliente', 400)
      }
      return clientsService.listClients(
        request.auth.establishmentId,
        search,
        LOOKUP_MAX_RESULTS,
        true,
      )
    }

    return clientsService.listClients(request.user.establishmentId, search)
  })

  // Insights de clientes (aniversariantes / sumidos): plano Essencial+.
  // Rotas estáticas: o find-my-way as prioriza sobre '/:id'.
  app.get('/birthdays', { config: { permission: 'clients.view' } }, async (request) => {
    await assertFeature(request.user.establishmentId, 'clientes_crm')
    return clientsService.listBirthdays(request.user.establishmentId)
  })

  app.get('/lapsed', { config: { permission: 'clients.view' } }, async (request) => {
    await assertFeature(request.user.establishmentId, 'clientes_crm')
    const { minDays } = lapsedQuerySchema.parse(request.query)
    return clientsService.listLapsed(request.user.establishmentId, minDays)
  })

  // A ficha traz o histórico e o quanto o cliente já gastou, então exige ver a
  // carteira: não é informação de quem só precisa achar o nome para agendar.
  app.get('/:id', { config: { permission: 'clients.view' } }, async (request) => {
    const { id } = idParamSchema.parse(request.params)
    return clientsService.getClientDetails(request.user.establishmentId, id)
  })

  // Cadastrar no ato do agendamento faz parte de agendar, por isso 'lookup' e
  // não 'manage': o cliente novo aparece na frente do profissional, não na tela
  // de clientes.
  app.post('/', { config: { permission: 'clients.lookup' } }, async (request, reply) => {
    const input = createClientSchema.parse(request.body)
    const client = await clientsService.createClient(request.user.establishmentId, input)
    return reply.status(201).send(client)
  })

  app.put('/:id', { config: { permission: 'clients.manage' } }, async (request) => {
    const { id } = idParamSchema.parse(request.params)
    const input = updateClientSchema.parse(request.body)
    return clientsService.updateClient(request.user.establishmentId, id, input)
  })
}
