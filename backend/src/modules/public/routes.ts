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

  app.get('/:slug/availability', async (request) => {
    const { slug } = slugParamSchema.parse(request.params)
    const query = availabilityQuerySchema.parse(request.query)
    return publicService.getAvailability(slug, query)
  })

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

  app.post('/:slug/appointments', async (request, reply) => {
    const { slug } = slugParamSchema.parse(request.params)
    const input = createBookingSchema.parse(request.body)
    const result = await publicService.createPublicBooking(slug, input)
    return reply.status(201).send(result)
  })
}
