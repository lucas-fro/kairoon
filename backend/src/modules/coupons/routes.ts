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

  app.get('/', async (request) => {
    const query = listCouponsQuerySchema.parse(request.query)
    return couponsService.listCoupons(request.user.establishmentId, query)
  })

  app.post('/', async (request, reply) => {
    const input = createCouponSchema.parse(request.body)
    const coupon = await couponsService.createCoupon(request.user.establishmentId, input)
    return reply.status(201).send(coupon)
  })

  app.put('/:id', async (request) => {
    const { id } = idParamSchema.parse(request.params)
    const input = updateCouponSchema.parse(request.body)
    return couponsService.updateCoupon(request.user.establishmentId, id, input)
  })

  app.delete('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    await couponsService.deleteCoupon(request.user.establishmentId, id)
    return reply.status(204).send()
  })

  // Preview do fechamento: valida sem gravar nada
  app.post('/validate', async (request) => {
    const input = validateCouponSchema.parse(request.body)
    return couponsService.validateCouponForCheckout(request.user.establishmentId, input)
  })

  app.get('/clients/:clientId', async (request) => {
    const { clientId } = clientIdParamSchema.parse(request.params)
    return couponsService.listClientCoupons(request.user.establishmentId, clientId)
  })
}
