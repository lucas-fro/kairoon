import { and, asc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { products } from '../../db/schema'
import { AppError } from '../../lib/errors'
import { assertFeature } from '../../lib/plan'
import type { CreateProductInput, UpdateProductInput } from './schemas'

export async function listProducts(establishmentId: string) {
  return db.query.products.findMany({
    where: eq(products.establishmentId, establishmentId),
    orderBy: [asc(products.name)],
  })
}

export async function createProduct(establishmentId: string, input: CreateProductInput) {
  await assertFeature(establishmentId, 'estoque')
  const [product] = await db
    .insert(products)
    .values({ ...input, establishmentId })
    .returning()
  return product
}

export async function updateProduct(
  establishmentId: string,
  id: string,
  input: UpdateProductInput,
) {
  if (Object.keys(input).length === 0) {
    throw new AppError('Nenhum dado para atualizar', 400)
  }
  const [updated] = await db
    .update(products)
    .set(input)
    .where(and(eq(products.id, id), eq(products.establishmentId, establishmentId)))
    .returning()
  if (!updated) throw new AppError('Produto não encontrado', 404)
  return updated
}

export async function deleteProduct(establishmentId: string, id: string) {
  const deleted = await db
    .delete(products)
    .where(and(eq(products.id, id), eq(products.establishmentId, establishmentId)))
    .returning({ id: products.id })
  if (deleted.length === 0) throw new AppError('Produto não encontrado', 404)
}
