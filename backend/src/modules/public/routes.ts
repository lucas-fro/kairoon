import type { FastifyInstance } from 'fastify'
import {
  availabilityQuerySchema,
  createBookingSchema,
  identifyClientSchema,
  slugParamSchema,
} from './schemas'
import * as publicService from './service'

export async function publicRoutes(app: FastifyInstance) {
  app.get('/:slug', async (request) => {
    const { slug } = slugParamSchema.parse(request.params)
    return publicService.getPublicEstablishment(slug)
  })

  // Rate limit por IP: sem ele, dá para varrer todos os horários livres em
  // massa (scraping) sem custo.
  app.get(
    '/:slug/availability',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const { slug } = slugParamSchema.parse(request.params)
      const query = availabilityQuerySchema.parse(request.query)
      return publicService.getAvailability(slug, query)
    },
  )

  // Rate limit agressivo: sem ele, este endpoint permite enumerar telefones
  // e descobrir nomes de clientes da base (PII) por força bruta.
  app.post(
    '/:slug/identify',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request) => {
      const { slug } = slugParamSchema.parse(request.params)
      const { phone } = identifyClientSchema.parse(request.body)
      return publicService.identifyClient(slug, phone)
    },
  )

  // Rate limit por IP: sem ele, dá para inundar a agenda/CRM de um
  // estabelecimento com agendamentos e clientes falsos.
  app.post(
    '/:slug/appointments',
    { config: { rateLimit: { max: 15, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { slug } = slugParamSchema.parse(request.params)
      const input = createBookingSchema.parse(request.body)
      const result = await publicService.createPublicBooking(slug, input)
      return reply.status(201).send(result)
    },
  )
}
