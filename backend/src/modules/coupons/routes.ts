import type { FastifyInstance } from 'fastify'
import {
  clientIdParamSchema,
  createCouponSchema,
  idParamSchema,
  listCouponsQuerySchema,
  updateCouponSchema,
  validateCouponSchema,
} from './schemas'
import * as couponsService from './service'

export async function couponsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  app.get('/', { config: { permission: 'marketing.view' } }, async (request) => {
    const query = listCouponsQuerySchema.parse(request.query)
    return couponsService.listCoupons(request.user.establishmentId, query)
  })

  app.post('/', { config: { permission: 'marketing.manage' } }, async (request, reply) => {
    const input = createCouponSchema.parse(request.body)
    const coupon = await couponsService.createCoupon(request.user.establishmentId, input)
    return reply.status(201).send(coupon)
  })

  app.put('/:id', { config: { permission: 'marketing.manage' } }, async (request) => {
    const { id } = idParamSchema.parse(request.params)
    const input = updateCouponSchema.parse(request.body)
    return couponsService.updateCoupon(request.user.establishmentId, id, input)
  })

  app.delete('/:id', { config: { permission: 'marketing.manage' } }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    await couponsService.deleteCoupon(request.user.establishmentId, id)
    return reply.status(204).send()
  })

  // Preview do fechamento: valida sem gravar nada. Fica em agenda.complete, e
  // não em marketing, porque quem fecha a comanda aplica o cupom do cliente sem
  // ter nada a ver com quem cria as campanhas.
  app.post('/validate', { config: { permission: 'agenda.complete' } }, async (request) => {
    const input = validateCouponSchema.parse(request.body)
    return couponsService.validateCouponForCheckout(request.user.establishmentId, input)
  })

  // A leitura é 'fidelity.lookup', e não 'marketing.view': o fechamento da
  // comanda lista os cupons pessoais do cliente junto do /validate, então quem
  // fecha precisa disto mesmo sem cuidar das campanhas. Marketing continua
  // alcançando, porque marketing.view implica fidelity.lookup.
  app.get('/clients/:clientId', { config: { permission: 'fidelity.lookup' } }, async (request) => {
    const { clientId } = clientIdParamSchema.parse(request.params)
    return couponsService.listClientCoupons(request.user.establishmentId, clientId)
  })
}
