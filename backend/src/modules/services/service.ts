import { and, asc, eq, inArray } from 'drizzle-orm'
import { db } from '../../db'
import { services } from '../../db/schema'
import { AppError } from '../../lib/errors'
import type { CreateServiceInput, UpdateServiceInput } from './schemas'

function isForeignKeyViolation(err: unknown): boolean {
  const error = err as { code?: string; cause?: { code?: string } }
  return error.code === '23503' || error.cause?.code === '23503'
}

/**
 * Calcula duração e preço de um pacote a partir dos serviços que o compõem.
 * Valida que há ao menos 2 itens, que todos pertencem ao estabelecimento e que
 * nenhum deles é, ele próprio, um pacote (sem aninhamento).
 */
async function resolvePackage(
  establishmentId: string,
  serviceIds: string[],
  discountType: 'percent' | 'fixed',
  discountValue: number,
) {
  const uniqueIds = [...new Set(serviceIds)]
  if (uniqueIds.length < 2) {
    throw new AppError('Um pacote precisa de pelo menos 2 serviços', 400)
  }

  const components = await db
    .select({ priceCents: services.priceCents, durationMinutes: services.durationMinutes })
    .from(services)
    .where(
      and(
        eq(services.establishmentId, establishmentId),
        inArray(services.id, uniqueIds),
        eq(services.isPackage, false),
      ),
    )
  if (components.length !== uniqueIds.length) {
    throw new AppError(
      'Selecione serviços válidos: um pacote não pode conter outro pacote',
      400,
    )
  }

  const sumCents = components.reduce((sum, c) => sum + c.priceCents, 0)
  const durationMinutes = components.reduce((sum, c) => sum + c.durationMinutes, 0)

  const rawDiscount =
    discountType === 'percent' ? Math.round((sumCents * Math.min(discountValue, 100)) / 100) : discountValue
  const discountCents = Math.min(Math.max(0, rawDiscount), sumCents)

  return {
    durationMinutes,
    priceCents: sumCents - discountCents,
    packageServiceIds: uniqueIds,
  }
}

export async function listServices(establishmentId: string) {
  return db.query.services.findMany({
    where: eq(services.establishmentId, establishmentId),
    orderBy: [asc(services.name)],
  })
}

export async function createService(establishmentId: string, input: CreateServiceInput) {
  if (input.isPackage) {
    const resolved = await resolvePackage(
      establishmentId,
      input.packageServiceIds!,
      input.packageDiscountType!,
      input.packageDiscountValue!,
    )
    const [service] = await db
      .insert(services)
      .values({
        establishmentId,
        name: input.name,
        active: input.active,
        isPackage: true,
        // duração personalizada tem prioridade; senão usa a soma dos serviços
        durationMinutes: input.durationMinutes ?? resolved.durationMinutes,
        priceCents: resolved.priceCents,
        packageServiceIds: resolved.packageServiceIds,
        packageDiscountType: input.packageDiscountType,
        packageDiscountValue: input.packageDiscountValue,
      })
      .returning()
    return service
  }

  const [service] = await db
    .insert(services)
    .values({
      establishmentId,
      name: input.name,
      active: input.active,
      durationMinutes: input.durationMinutes!,
      priceCents: input.priceCents!,
    })
    .returning()
  return service
}

export async function updateService(
  establishmentId: string,
  id: string,
  input: UpdateServiceInput,
) {
  const existing = await db.query.services.findFirst({
    where: and(eq(services.id, id), eq(services.establishmentId, establishmentId)),
  })
  if (!existing) throw new AppError('Serviço não encontrado', 404)

  const willBePackage = input.isPackage ?? existing.isPackage

  const patch: Partial<typeof services.$inferInsert> = {}
  if (input.name !== undefined) patch.name = input.name
  if (input.active !== undefined) patch.active = input.active

  if (willBePackage) {
    const ids = input.packageServiceIds ?? existing.packageServiceIds ?? []
    const type = (input.packageDiscountType ?? existing.packageDiscountType ?? 'percent') as
      | 'percent'
      | 'fixed'
    const value = input.packageDiscountValue ?? existing.packageDiscountValue ?? 0
    const resolved = await resolvePackage(establishmentId, ids, type, value)
    patch.isPackage = true
    // duração personalizada tem prioridade; sem novo valor, mantém a atual
    patch.durationMinutes = input.durationMinutes ?? existing.durationMinutes
    patch.priceCents = resolved.priceCents
    patch.packageServiceIds = resolved.packageServiceIds
    patch.packageDiscountType = type
    patch.packageDiscountValue = value
  } else {
    // Convertendo pacote → serviço simples exige duração e preço explícitos
    if (existing.isPackage && (input.durationMinutes === undefined || input.priceCents === undefined)) {
      throw new AppError('Informe a duração e o preço para converter em serviço simples', 400)
    }
    if (input.durationMinutes !== undefined) patch.durationMinutes = input.durationMinutes
    if (input.priceCents !== undefined) patch.priceCents = input.priceCents
    if (input.isPackage === false && existing.isPackage) {
      patch.isPackage = false
      patch.packageServiceIds = null
      patch.packageDiscountType = null
      patch.packageDiscountValue = null
    }
  }

  const [updated] = await db
    .update(services)
    .set(patch)
    .where(and(eq(services.id, id), eq(services.establishmentId, establishmentId)))
    .returning()
  if (!updated) throw new AppError('Serviço não encontrado', 404)
  return updated
}

export async function deleteService(establishmentId: string, id: string) {
  try {
    const deleted = await db
      .delete(services)
      .where(and(eq(services.id, id), eq(services.establishmentId, establishmentId)))
      .returning()
    if (deleted.length === 0) throw new AppError('Serviço não encontrado', 404)
  } catch (err) {
    if (err instanceof AppError) throw err
    if (isForeignKeyViolation(err)) {
      throw new AppError(
        'Este serviço possui agendamentos vinculados. Desative-o em vez de excluir.',
        409,
      )
    }
    throw err
  }
}
