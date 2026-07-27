import type { FastifyInstance } from 'fastify'
import {
  manageAvailabilityQuerySchema,
  requestCodeSchema,
  rescheduleSchema,
  slugParamSchema,
  tokenQuerySchema,
  verifyCodeSchema,
} from './schemas'
import * as manageService from './service'

/**
 * Área pública de gerenciamento (`/public/:slug/manage`). Todas as rotas são
 * sem JWT de dono, então o gate global de somente-leitura (app.ts) não as
 * alcança: quem precisa checar o acesso da conta faz isso no service.
 *
 * Os rate limits são apertados de propósito: são endpoints que mexem em agenda
 * e disparam WhatsApp a partir de um link público.
 *
 * Daí todas declararem permission 'public': quem prova o acesso é o token do
 * link (ou o código enviado por WhatsApp), verificado no service, e não uma
 * sessão da equipe.
 */
export async function publicManageRoutes(app: FastifyInstance) {
  // O `t` (token) é sempre lido da query string, nunca do path: assim ele não
  // vaza para logs de acesso do proxy do mesmo jeito que um path parameter.
  app.get(
    '/:slug/manage/appointment',
    { config: { permission: 'public', rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const { slug } = slugParamSchema.parse(request.params)
      const { t } = tokenQuerySchema.parse(request.query)
      return manageService.getByToken(slug, t)
    },
  )

  // Limite baixo: cada chamada pode disparar um WhatsApp. O cooldown por
  // telefone (no service) complementa, porque este limite é por IP.
  app.post(
    '/:slug/manage/request-code',
    { config: { permission: 'public', rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request) => {
      const { slug } = slugParamSchema.parse(request.params)
      const { phone } = requestCodeSchema.parse(request.body)
      return manageService.requestAccessCode(slug, phone)
    },
  )

  app.post(
    '/:slug/manage/verify',
    { config: { permission: 'public', rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request) => {
      const { slug } = slugParamSchema.parse(request.params)
      const { phone, code } = verifyCodeSchema.parse(request.body)
      return manageService.verifyAccessCode(slug, phone, code)
    },
  )

  app.get(
    '/:slug/manage/availability',
    { config: { permission: 'public', rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const { slug } = slugParamSchema.parse(request.params)
      const { t } = tokenQuerySchema.parse(request.query)
      const { date } = manageAvailabilityQuerySchema.parse(request.query)
      return manageService.availabilityForReschedule(slug, t, date)
    },
  )

  app.post(
    '/:slug/manage/cancel',
    { config: { permission: 'public', rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request) => {
      const { slug } = slugParamSchema.parse(request.params)
      const { t } = tokenQuerySchema.parse(request.query)
      return manageService.cancelByToken(slug, t)
    },
  )

  app.post(
    '/:slug/manage/reschedule',
    { config: { permission: 'public', rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request) => {
      const { slug } = slugParamSchema.parse(request.params)
      const { t } = tokenQuerySchema.parse(request.query)
      const input = rescheduleSchema.parse(request.body)
      return manageService.rescheduleByToken(slug, t, input)
    },
  )

  app.post(
    '/:slug/manage/opt-out',
    { config: { permission: 'public', rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request) => {
      const { slug } = slugParamSchema.parse(request.params)
      const { t } = tokenQuerySchema.parse(request.query)
      return manageService.optOutByToken(slug, t)
    },
  )
}
