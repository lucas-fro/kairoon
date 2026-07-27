import type { FastifyInstance } from 'fastify'
import { createProductSchema, idParamSchema, updateProductSchema } from './schemas'
import * as productsService from './service'

export async function productsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  // A leitura é 'catalog.lookup', e não 'stock.view': vender produto no
  // fechamento da comanda exige listar, mesmo para quem não cuida do estoque. A
  // aba Estoque em si continua escondida no frontend por stock.view.
  app.get('/', { config: { permission: 'catalog.lookup' } }, async (request) => {
    return productsService.listProducts(request.user.establishmentId)
  })

  app.post('/', { config: { permission: 'stock.manage' } }, async (request, reply) => {
    const input = createProductSchema.parse(request.body)
    const product = await productsService.createProduct(request.user.establishmentId, input)
    return reply.status(201).send(product)
  })

  app.put('/:id', { config: { permission: 'stock.manage' } }, async (request) => {
    const { id } = idParamSchema.parse(request.params)
    const input = updateProductSchema.parse(request.body)
    return productsService.updateProduct(request.user.establishmentId, id, input)
  })

  app.delete('/:id', { config: { permission: 'stock.manage' } }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params)
    await productsService.deleteProduct(request.user.establishmentId, id)
    return reply.status(204).send()
  })
}
