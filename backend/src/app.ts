import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'
import { ZodError } from 'zod'
import { env } from './env'
import { AppError } from './lib/errors'
import { MAX_IMAGE_BYTES } from './lib/imageUpload'
import { getAccessState } from './lib/plan'
import { authPlugin } from './plugins/auth'

declare module 'fastify' {
  interface FastifyContextConfig {
    /**
     * Rotas marcadas com isto continuam liberadas quando a conta está em
     * somente-leitura (teste grátis expirado sem assinatura), ex.: assinar,
     * gerenciar/excluir a conta. Ver o hook `onRequest` abaixo.
     */
    allowWhenReadOnly?: boolean
  }
}

/** Métodos que alteram estado: o gate de somente-leitura só age nestes. */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
import { appointmentsRoutes } from './modules/appointments/routes'
import { authRoutes } from './modules/auth/routes'
import { clientsRoutes } from './modules/clients/routes'
import { commissionsRoutes } from './modules/commissions/routes'
import { couponsRoutes } from './modules/coupons/routes'
import { dashboardRoutes } from './modules/dashboard/routes'
import { employeesRoutes } from './modules/employees/routes'
import { establishmentRoutes } from './modules/establishment/routes'
import { loyaltyRoutes } from './modules/loyalty/routes'
import { paymentsRoutes } from './modules/payments/routes'
import { pointsRoutes } from './modules/points/routes'
import { productsRoutes } from './modules/products/routes'
import { publicRoutes } from './modules/public/routes'
import { realtimeRoutes } from './modules/realtime/routes'
import { recurringExpensesRoutes } from './modules/recurringExpenses/routes'
import { reportsRoutes } from './modules/reports/routes'
import { servicesRoutes } from './modules/services/routes'
import { transactionsRoutes } from './modules/transactions/routes'
import { uploadsRoutes } from './modules/uploads/routes'
import { waitlistRoutes } from './modules/waitlist/routes'

export async function buildApp() {
  // trustProxy: o backend roda atrás do nginx do frontend (X-Forwarded-For /
  // X-Real-IP). Sem isso, request.ip sempre traz o IP interno do container,
  // o que quebra o remoteIp exigido pelo antifraude do Asaas.
  const app = Fastify({ logger: true, trustProxy: true })

  // O error handler precisa ser definido ANTES dos registers: cada plugin de
  // rotas (await register) snapshota o handler vigente no momento do registro.
  app.setErrorHandler((error: unknown, request, reply) => {
    // O check por name cobre o caso de instância dupla do zod (interop
    // CJS/ESM), em que instanceof falha mesmo sendo um ZodError legítimo.
    if (error instanceof ZodError || (error instanceof Error && error.name === 'ZodError')) {
      return reply.status(400).send({
        message: 'Dados inválidos',
        issues: (error as ZodError).flatten().fieldErrors,
      })
    }
    if (error instanceof AppError) {
      return reply
        .status(error.statusCode)
        .send({ message: error.message, ...(error.code ? { code: error.code } : {}) })
    }
    const fastifyError = error as { statusCode?: number; message?: string }
    if (
      typeof fastifyError.statusCode === 'number' &&
      fastifyError.statusCode < 500 &&
      fastifyError.message
    ) {
      return reply.status(fastifyError.statusCode).send({ message: fastifyError.message })
    }
    request.log.error(error)
    return reply.status(500).send({ message: 'Erro interno do servidor' })
  })

  await app.register(cors, { origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()) })
  // global: false, pois o limite é aplicado por rota via config.rateLimit
  // (hoje apenas nas rotas públicas sensíveis a abuso)
  await app.register(rateLimit, { global: false })
  await app.register(authPlugin)
  // Upload de imagens (logos/banners/fotos): 1 arquivo por request, teto de 5 MB.
  await app.register(multipart, {
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 5 },
  })

  // Gate global de somente-leitura: contas com o teste grátis expirado (e sem
  // assinatura paga) podem LER tudo, mas não escrevem nada, exceto rotas
  // marcadas com `config.allowWhenReadOnly` (assinar/gerenciar conta). É a
  // garantia no servidor: a UI só reforça. Roda em onRequest (após o roteamento,
  // então routeOptions já existe) e só toca requisições autenticadas de dono;
  // públicas/não-autenticadas passam direto (o booking público é barrado dentro
  // do próprio serviço).
  app.addHook('onRequest', async (request) => {
    if (!MUTATING_METHODS.has(request.method)) return
    if (!request.routeOptions?.url) return
    if (request.routeOptions.config?.allowWhenReadOnly) return
    try {
      await request.jwtVerify()
    } catch {
      return
    }
    const access = await getAccessState(request.user.establishmentId)
    if (!access.canWrite) {
      throw new AppError(
        'Seu teste grátis terminou. Assine um plano para continuar editando.',
        402,
        'TRIAL_EXPIRED',
      )
    }
  })

  app.get('/health', async () => ({ status: 'ok' }))

  await app.register(authRoutes, { prefix: '/auth' })
  await app.register(establishmentRoutes, { prefix: '/establishment' })
  await app.register(servicesRoutes, { prefix: '/services' })
  await app.register(productsRoutes, { prefix: '/products' })
  await app.register(employeesRoutes, { prefix: '/employees' })
  await app.register(clientsRoutes, { prefix: '/clients' })
  await app.register(appointmentsRoutes, { prefix: '/appointments' })
  await app.register(waitlistRoutes, { prefix: '/waitlist' })
  await app.register(transactionsRoutes, { prefix: '/transactions' })
  await app.register(recurringExpensesRoutes, { prefix: '/recurring-expenses' })
  await app.register(dashboardRoutes, { prefix: '/dashboard' })
  await app.register(reportsRoutes, { prefix: '/reports' })
  await app.register(commissionsRoutes, { prefix: '/commissions' })
  await app.register(couponsRoutes, { prefix: '/coupons' })
  await app.register(loyaltyRoutes, { prefix: '/loyalty' })
  await app.register(pointsRoutes, { prefix: '/points' })
  await app.register(paymentsRoutes, { prefix: '/payments' })
  await app.register(uploadsRoutes, { prefix: '/uploads' })
  await app.register(publicRoutes, { prefix: '/public' })
  await app.register(realtimeRoutes, { prefix: '/realtime' })

  return app
}
