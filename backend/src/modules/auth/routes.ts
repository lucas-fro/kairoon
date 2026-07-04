import type { FastifyInstance } from 'fastify'
import { loginSchema, registerSchema, updateProfileSchema } from './schemas'
import * as authService from './service'

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', async (request, reply) => {
    const input = registerSchema.parse(request.body)
    const { user, establishment } = await authService.registerOwner(input)
    const token = app.jwt.sign({ sub: user.id, establishmentId: establishment.id })
    return reply.status(201).send({ token, user, establishment })
  })

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
}
