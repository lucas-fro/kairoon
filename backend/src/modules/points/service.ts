import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../../db'
import { clients, pointsEntries, pointsPrograms, pointsRewards, services } from '../../db/schema'
import { AppError } from '../../lib/errors'
import { lockClientLoyalty } from '../../lib/locks'
import { assertFeature } from '../../lib/plan'
import { mintPersonalCoupon } from '../coupons/service'
import type { DbTransaction } from '../coupons/service'
import type {
  CreatePointsRewardInput,
  RedeemPointsInput,
  UpdatePointsRewardInput,
  UpsertPointsProgramInput,
} from './schemas'

type DbClient = typeof db | DbTransaction

async function getPointsBalance(
  client: DbClient,
  establishmentId: string,
  clientId: string,
): Promise<number> {
  const [row] = await client
    .select({ value: sql<number>`coalesce(sum(${pointsEntries.points}), 0)::int` })
    .from(pointsEntries)
    .where(
      and(
        eq(pointsEntries.establishmentId, establishmentId),
        eq(pointsEntries.clientId, clientId),
      ),
    )
  return Number(row?.value ?? 0)
}

async function assertRewardServicesBelong(establishmentId: string, serviceIds: string[]) {
  if (serviceIds.length === 0) return
  const rows = await db
    .select({ id: services.id })
    .from(services)
    .where(and(eq(services.establishmentId, establishmentId), inArray(services.id, serviceIds)))
  if (rows.length !== new Set(serviceIds).size) {
    throw new AppError('Selecione serviços válidos para a recompensa', 404)
  }
}

/** Normaliza os serviços elegíveis: só para free_service e sem vazio → null. */
function normalizeRewardServiceIds(
  rewardType: 'percent' | 'fixed' | 'free_service',
  ids: string[] | null | undefined,
): string[] | null {
  if (rewardType !== 'free_service' || !ids || ids.length === 0) return null
  return ids
}

export async function getProgram(establishmentId: string) {
  const program = await db.query.pointsPrograms.findFirst({
    where: eq(pointsPrograms.establishmentId, establishmentId),
  })
  return program ?? null
}

export async function upsertProgram(establishmentId: string, input: UpsertPointsProgramInput) {
  await assertFeature(establishmentId, 'fidelidade')
  const values = {
    establishmentId,
    active: input.active,
    pointsPerService: input.pointsPerService,
    pointsPerCurrencyUnit: input.pointsPerCurrencyUnit,
  }
  const [program] = await db
    .insert(pointsPrograms)
    .values(values)
    .onConflictDoUpdate({ target: pointsPrograms.establishmentId, set: values })
    .returning()
  return program
}

export async function listRewards(establishmentId: string) {
  return db.query.pointsRewards.findMany({
    where: eq(pointsRewards.establishmentId, establishmentId),
    orderBy: [asc(pointsRewards.costPoints)],
  })
}

export async function createReward(establishmentId: string, input: CreatePointsRewardInput) {
  await assertFeature(establishmentId, 'fidelidade')
  const isFreeService = input.rewardType === 'free_service'
  const rewardServiceIds = normalizeRewardServiceIds(input.rewardType, input.rewardServiceIds)
  if (rewardServiceIds) await assertRewardServicesBelong(establishmentId, rewardServiceIds)
  const [reward] = await db
    .insert(pointsRewards)
    .values({
      establishmentId,
      name: input.name,
      costPoints: input.costPoints,
      rewardType: input.rewardType,
      rewardValue: isFreeService ? 0 : input.rewardValue,
      rewardServiceIds,
      active: input.active,
    })
    .returning()
  return reward
}

export async function updateReward(
  establishmentId: string,
  id: string,
  input: UpdatePointsRewardInput,
) {
  await assertFeature(establishmentId, 'fidelidade')
  const existing = await db.query.pointsRewards.findFirst({
    where: and(eq(pointsRewards.id, id), eq(pointsRewards.establishmentId, establishmentId)),
  })
  if (!existing) throw new AppError('Recompensa não encontrada', 404)

  const isFreeService = input.rewardType === 'free_service'
  const rewardServiceIds = normalizeRewardServiceIds(input.rewardType, input.rewardServiceIds)
  if (rewardServiceIds) await assertRewardServicesBelong(establishmentId, rewardServiceIds)

  const [updated] = await db
    .update(pointsRewards)
    .set({
      name: input.name,
      costPoints: input.costPoints,
      rewardType: input.rewardType,
      rewardValue: isFreeService ? 0 : input.rewardValue,
      rewardServiceIds,
      active: input.active,
    })
    .where(and(eq(pointsRewards.id, id), eq(pointsRewards.establishmentId, establishmentId)))
    .returning()
  if (!updated) throw new AppError('Recompensa não encontrada', 404)
  return updated
}

export async function deleteReward(establishmentId: string, id: string) {
  // points_entries.rewardId é set null: o histórico de resgates sobrevive
  const deleted = await db
    .delete(pointsRewards)
    .where(and(eq(pointsRewards.id, id), eq(pointsRewards.establishmentId, establishmentId)))
    .returning()
  if (deleted.length === 0) throw new AppError('Recompensa não encontrada', 404)
}

/** Saldo + recompensas do programa para a tela do cliente */
export async function getClientPoints(establishmentId: string, clientId: string) {
  const program = await getProgram(establishmentId)
  const balance = await getPointsBalance(db, establishmentId, clientId)
  const rewards = await db.query.pointsRewards.findMany({
    where: and(eq(pointsRewards.establishmentId, establishmentId), eq(pointsRewards.active, true)),
    orderBy: [asc(pointsRewards.costPoints)],
  })
  return { program, balance, rewards }
}

/**
 * Resgata um nível do catálogo: debita os pontos (entry negativa) e cunha um
 * cupom pessoal de uso único.
 */
export async function redeemPoints(establishmentId: string, input: RedeemPointsInput) {
  const client = await db.query.clients.findFirst({
    where: and(eq(clients.id, input.clientId), eq(clients.establishmentId, establishmentId)),
    columns: { id: true },
  })
  if (!client) throw new AppError('Cliente não encontrado', 404)

  return db.transaction(async (tx) => {
    // Serializa resgates do mesmo cliente: a checagem de saldo é check-then-insert
    await lockClientLoyalty(tx, input.clientId)

    const program = await tx.query.pointsPrograms.findFirst({
      where: eq(pointsPrograms.establishmentId, establishmentId),
    })
    if (!program?.active) throw new AppError('O programa de pontos não está ativo', 400)

    const reward = await tx.query.pointsRewards.findFirst({
      where: and(
        eq(pointsRewards.id, input.rewardId),
        eq(pointsRewards.establishmentId, establishmentId),
      ),
    })
    if (!reward || !reward.active) throw new AppError('Recompensa não encontrada', 404)

    const balance = await getPointsBalance(tx, establishmentId, input.clientId)
    if (balance < reward.costPoints) {
      throw new AppError('O cliente ainda não tem pontos suficientes', 400)
    }

    const coupon = await mintPersonalCoupon(tx, {
      establishmentId,
      clientId: input.clientId,
      source: 'points',
      name: reward.name,
      discountType: reward.rewardType,
      discountValue: reward.rewardValue,
      appliesToServiceIds:
        reward.rewardType === 'free_service' && reward.rewardServiceIds?.length
          ? reward.rewardServiceIds
          : null,
    })

    const [entry] = await tx
      .insert(pointsEntries)
      .values({
        establishmentId,
        clientId: input.clientId,
        appointmentId: null,
        rewardId: reward.id,
        type: 'redeem',
        points: -reward.costPoints,
        couponId: coupon.id,
      })
      .returning()

    return { entry, coupon, balance: balance - reward.costPoints }
  })
}

/**
 * Sincroniza os pontos do atendimento dentro da transação de updateAppointment
 * (delete incondicional do 'earn', insert só se concluído). A guarda de saldo
 * negativo bloqueia reabrir/refinalizar quando os pontos já foram resgatados.
 * Chamar com lockClientLoyalty já adquirido.
 */
export async function syncPointsEntry(
  tx: DbTransaction,
  params: {
    establishmentId: string
    appointmentId: string
    clientId: string
    completed: boolean
    finalCents: number
  },
) {
  await tx
    .delete(pointsEntries)
    .where(
      and(
        eq(pointsEntries.appointmentId, params.appointmentId),
        eq(pointsEntries.type, 'earn'),
      ),
    )

  if (params.completed) {
    const program = await tx.query.pointsPrograms.findFirst({
      where: eq(pointsPrograms.establishmentId, params.establishmentId),
    })
    if (program?.active) {
      const earned =
        program.pointsPerService +
        Math.floor(params.finalCents / 100) * program.pointsPerCurrencyUnit
      if (earned > 0) {
        await tx.insert(pointsEntries).values({
          establishmentId: params.establishmentId,
          clientId: params.clientId,
          appointmentId: params.appointmentId,
          type: 'earn',
          points: earned,
        })
      }
    }
  }

  // Se o saldo ficaria negativo, os pontos deste atendimento já financiaram um
  // resgate — bloqueia (espelha o throw de estoque insuficiente).
  const balance = await getPointsBalance(tx, params.establishmentId, params.clientId)
  if (balance < 0) {
    throw new AppError(
      'Não é possível alterar: os pontos deste atendimento já foram resgatados',
      409,
    )
  }
}
