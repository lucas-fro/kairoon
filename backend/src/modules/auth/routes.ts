import type { FastifyInstance } from 'fastify'
import {
  changePasswordSchema,
  forgotPasswordRequestSchema,
  forgotPasswordResetSchema,
  forgotPasswordVerifySchema,
  loginSchema,
  registerSchema,
  slugAvailabilitySchema,
  updateProfileSchema,
} from './schemas'
import * as authService from './service'

export async function authRoutes(app: FastifyInstance) {
  // Rate limit por IP: cria contas (e inicia testes grátis); freia bots/farming.
  app.post(
    '/register',
    { config: { permission: 'public', rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const input = registerSchema.parse(request.body)
      const { user, establishment } = await authService.registerOwner(input)
      const token = app.jwt.sign({ sub: user.id, establishmentId: establishment.id })
      return reply.status(201).send({ token, user, establishment })
    },
  )

  // Checagem de disponibilidade do link público durante o cadastro.
  // Rate limit: sem ele, dá para enumerar quais slugs existem em massa.
  app.get(
    '/slug-available',
    { config: { permission: 'public', rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const { slug } = slugAvailabilitySchema.parse(request.query)
      return authService.isSlugAvailable(slug)
    },
  )

  // Rate limit por IP: sem ele, o login aceita tentativas de senha ilimitadas
  // (credential stuffing / força bruta).
  app.post(
    '/login',
    { config: { permission: 'public', rateLimit: { max: 10, timeWindow: '5 minutes' } } },
    async (request) => {
      const input = loginSchema.parse(request.body)
      const { user, establishment } = await authService.authenticate(input)
      const token = app.jwt.sign({ sub: user.id, establishmentId: establishment.id })
      return { token, user, establishment }
    },
  )

  app.get('/me', { config: { permission: 'authenticated' } }, async (request) => {
    return authService.getProfile(request.auth.userId)
  })

  // Dados cadastrais são do contratante: nem o switch admin alcança. Gestão da
  // própria conta continua liberada mesmo em somente-leitura.
  app.put(
    '/me',
    { config: { permission: 'owner', allowWhenReadOnly: true } },
    async (request) => {
      const input = updateProfileSchema.parse(request.body)
      return authService.updateProfile(request.auth.userId, input)
    },
  )

  // Trocar a PRÓPRIA senha vale para qualquer sessão, inclusive a do
  // funcionário: sem isto ele ficaria preso à senha criada no convite.
  app.put(
    '/me/password',
    {
      config: {
        permission: 'authenticated',
        allowWhenReadOnly: true,
        rateLimit: { max: 10, timeWindow: '15 minutes' },
      },
    },
    async (request) => {
      const { currentPassword, newPassword } = changePasswordSchema.parse(request.body)
      return authService.changePassword(request.auth.userId, currentPassword, newPassword)
    },
  )

  // Recuperação de senha pública, por código no e-mail (3 passos). Rate limit por
  // IP protege contra spam de e-mail e força bruta do código de 6 dígitos.
  app.post(
    '/forgot-password/request',
    { config: { permission: 'public', rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (request) => {
      const { email } = forgotPasswordRequestSchema.parse(request.body)
      return authService.requestPasswordResetByEmail(email)
    },
  )

  app.post(
    '/forgot-password/verify',
    { config: { permission: 'public', rateLimit: { max: 20, timeWindow: '5 minutes' } } },
    async (request) => {
      const { email, code } = forgotPasswordVerifySchema.parse(request.body)
      return authService.verifyPasswordResetCode(email, code)
    },
  )

  app.post(
    '/forgot-password/reset',
    { config: { permission: 'public', rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (request) => {
      const { email, code, newPassword } = forgotPasswordResetSchema.parse(request.body)
      return authService.resetPasswordByEmail(email, code, newPassword)
    },
  )
}
