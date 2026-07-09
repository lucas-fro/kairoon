import type { FastifyInstance } from 'fastify'
import {
  confirmPasswordResetSchema,
  loginSchema,
  registerSchema,
  slugAvailabilitySchema,
  updateProfileSchema,
} from './schemas'
import * as authService from './service'

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', async (request, reply) => {
    const input = registerSchema.parse(request.body)
    const { user, establishment } = await authService.registerOwner(input)
    const token = app.jwt.sign({ sub: user.id, establishmentId: establishment.id })
    return reply.status(201).send({ token, user, establishment })
  })

  // Checagem de disponibilidade do link público durante o cadastro.
  // Rate limit: sem ele, dá para enumerar quais slugs existem em massa.
  app.get(
    '/slug-available',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const { slug } = slugAvailabilitySchema.parse(request.query)
      return authService.isSlugAvailable(slug)
    },
  )

  app.post('/login', async (request) => {
    const input = loginSchema.parse(request.body)
    const { user, establishment } = await authService.authenticateOwner(input)
    const token = app.jwt.sign({ sub: user.id, establishmentId: establishment.id })
    return { token, user, establishment }
  })

  app.get('/me', { preHandler: [app.authenticate] }, async (request) => {
    return authService.getProfile(request.user.sub)
  })

  app.put('/me', { preHandler: [app.authenticate] }, async (request) => {
    const input = updateProfileSchema.parse(request.body)
    return authService.updateProfile(request.user.sub, input)
  })

  // Redefinição de senha por código no e-mail (usuário logado, na aba Conta).
  // Rate limit protege contra spam de e-mail e força bruta do código.
  app.post(
    '/password-reset/request',
    { preHandler: [app.authenticate], config: { rateLimit: { max: 3, timeWindow: '5 minutes' } } },
    async (request) => {
      return authService.requestPasswordReset(request.user.sub)
    },
  )

  app.post(
    '/password-reset/confirm',
    { preHandler: [app.authenticate], config: { rateLimit: { max: 6, timeWindow: '5 minutes' } } },
    async (request) => {
      const { code, newPassword } = confirmPasswordResetSchema.parse(request.body)
      return authService.confirmPasswordReset(request.user.sub, code, newPassword)
    },
  )
}
