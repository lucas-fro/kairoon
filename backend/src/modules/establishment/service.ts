import { and, asc, eq, ne, sql } from 'drizzle-orm'
import { db } from '../../db'
import { employees, establishments, timeBlocks, users, workingHours } from '../../db/schema'
import { timeToMinutes } from '../../lib/datetime'
import { AppError } from '../../lib/errors'
import type {
  CreateTimeBlockInput,
  UpdateEstablishmentInput,
  UpdateWorkingHoursInput,
} from './schemas'

// Limite de profissionais temporariamente elevado (fase de testes)
const PLAN_LIMITS = { employees: 99, establishments: 1 }

function isUniqueViolation(err: unknown): boolean {
  const error = err as { code?: string; cause?: { code?: string } }
  return error.code === '23505' || error.cause?.code === '23505'
}

export async function getEstablishment(establishmentId: string) {
  const establishment = await db.query.establishments.findFirst({
    where: eq(establishments.id, establishmentId),
  })
  if (!establishment) throw new AppError('Estabelecimento não encontrado', 404)
  return establishment
}

export async function updateEstablishment(
  establishmentId: string,
  input: UpdateEstablishmentInput,
) {
  const hasChanges = Object.values(input).some((value) => value !== undefined)
  if (!hasChanges) throw new AppError('Nenhum dado para atualizar', 400)

  // Gate de escrita (defesa em profundidade): personalização visual só vale no
  // plano pago. A aplicação real é na leitura (getPublicEstablishment); aqui
  // apenas ignoramos silenciosamente para não persistir dados de plano grátis.
  const current = await db.query.establishments.findFirst({
    columns: { plan: true },
    where: eq(establishments.id, establishmentId),
  })
  if (!current) throw new AppError('Estabelecimento não encontrado', 404)
  const data = { ...input }
  if (current.plan === 'free') {
    delete data.themeColor
    delete data.bannerImageUrl
    delete data.footerMessage
  }

  const stillHasChanges = Object.values(data).some((value) => value !== undefined)
  if (!stillHasChanges) return getEstablishment(establishmentId)

  const [updated] = await db
    .update(establishments)
    .set(data)
    .where(eq(establishments.id, establishmentId))
    .returning()
  if (!updated) throw new AppError('Estabelecimento não encontrado', 404)
  return updated
}

export async function updateSlug(establishmentId: string, slug: string) {
  const existing = await db.query.establishments.findFirst({
    columns: { id: true },
    where: and(eq(establishments.slug, slug), ne(establishments.id, establishmentId)),
  })
  if (existing) throw new AppError('Este link já está em uso', 409)

  try {
    const [updated] = await db
      .update(establishments)
      .set({ slug })
      .where(eq(establishments.id, establishmentId))
      .returning()
    if (!updated) throw new AppError('Estabelecimento não encontrado', 404)
    return updated
  } catch (err) {
    if (err instanceof AppError) throw err
    if (isUniqueViolation(err)) throw new AppError('Este link já está em uso', 409)
    throw err
  }
}

export async function checkSlugAvailability(establishmentId: string, slug: string) {
  const owner = await db.query.establishments.findFirst({
    columns: { id: true },
    where: eq(establishments.slug, slug),
  })
  return !owner || owner.id === establishmentId
}

export async function listWorkingHours(establishmentId: string) {
  return db.query.workingHours.findMany({
    where: eq(workingHours.establishmentId, establishmentId),
    orderBy: [asc(workingHours.dayOfWeek)],
  })
}

export async function updateWorkingHours(
  establishmentId: string,
  input: UpdateWorkingHoursInput,
) {
  const seenDays = new Set<number>()
  for (const item of input.workingHours) {
    if (seenDays.has(item.dayOfWeek)) {
      throw new AppError('Dias da semana duplicados: informe cada dia uma única vez', 400)
    }
    seenDays.add(item.dayOfWeek)
    if (!item.isClosed && timeToMinutes(item.opensAt) >= timeToMinutes(item.closesAt)) {
      throw new AppError('O horário de abertura deve ser anterior ao horário de fechamento', 400)
    }
  }

  return db.transaction(async (tx) => {
    for (const item of input.workingHours) {
      await tx
        .insert(workingHours)
        .values({ establishmentId, ...item })
        .onConflictDoUpdate({
          target: [workingHours.establishmentId, workingHours.dayOfWeek],
          set: {
            opensAt: item.opensAt,
            closesAt: item.closesAt,
            isClosed: item.isClosed,
          },
        })
    }

    return tx.query.workingHours.findMany({
      where: eq(workingHours.establishmentId, establishmentId),
      orderBy: [asc(workingHours.dayOfWeek)],
    })
  })
}

export async function getPlan(establishmentId: string) {
  const establishment = await db.query.establishments.findFirst({
    columns: { plan: true },
    where: eq(establishments.id, establishmentId),
  })
  if (!establishment) throw new AppError('Estabelecimento não encontrado', 404)

  const [row] = await db
    .select({ count: sql<string>`count(*)` })
    .from(employees)
    .where(eq(employees.establishmentId, establishmentId))

  return {
    plan: establishment.plan,
    limits: PLAN_LIMITS,
    usage: { employees: Number(row?.count ?? 0) },
  }
}

export async function deleteAccount(userId: string) {
  const deleted = await db.delete(users).where(eq(users.id, userId)).returning({ id: users.id })
  if (deleted.length === 0) throw new AppError('Usuário não encontrado', 404)
}

export async function listTimeBlocks(establishmentId: string) {
  return db.query.timeBlocks.findMany({
    where: eq(timeBlocks.establishmentId, establishmentId),
    orderBy: [asc(timeBlocks.date), asc(timeBlocks.startTime)],
  })
}

export async function createTimeBlock(establishmentId: string, input: CreateTimeBlockInput) {
  const [row] = await db
    .insert(timeBlocks)
    .values({
      establishmentId,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      reason: input.reason,
    })
    .returning()
  return row
}

export async function deleteTimeBlock(establishmentId: string, id: string) {
  const deleted = await db
    .delete(timeBlocks)
    .where(and(eq(timeBlocks.id, id), eq(timeBlocks.establishmentId, establishmentId)))
    .returning({ id: timeBlocks.id })
  if (deleted.length === 0) throw new AppError('Bloqueio não encontrado', 404)
}
