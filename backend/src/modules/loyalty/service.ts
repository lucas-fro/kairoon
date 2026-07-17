import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '../../db'
import { clients, loyaltyPrograms, loyaltyRedemptions, loyaltyStamps, services } from '../../db/schema'
import { AppError } from '../../lib/errors'
import { lockClientLoyalty } from '../../lib/locks'
import { assertFeature } from '../../lib/plan'
import { mintPersonalCoupon } from '../coupons/service'
import type { DbTransaction } from '../coupons/service'
import type { RedeemLoyaltyInput, UpsertLoyaltyProgramInput } from './schemas'

type DbClient = typeof db | DbTransaction

async function countAvailableStamps(
  client: DbClient,
  establishmentId: string,
  clientId: string,
): Promise<number> {
  const [row] = await client
    .select({ value: count() })
    .from(loyaltyStamps)
    .where(
      and(
        eq(loyaltyStamps.establishmentId, establishmentId),
        eq(loyaltyStamps.clientId, clientId),
        isNull(loyaltyStamps.redemptionId),
      ),
    )
  return Number(row?.value ?? 0)
}

export async function getProgram(establishmentId: string) {
  const program = await db.query.loyaltyPrograms.findFirst({
    where: eq(loyaltyPrograms.establishmentId, establishmentId),
  })
  return program ?? null
}

/** Valida que todos os serviços da recompensa pertencem ao estabelecimento. */
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

export async function upsertProgram(establishmentId: string, input: UpsertLoyaltyProgramInput) {
  await assertFeature(establishmentId, 'fidelidade')

  // free_service pode valer para um ou mais serviços; vazio = qualquer serviço.
  const rewardServiceIds =
    input.rewardType === 'free_service' && input.rewardServiceIds && input.rewardServiceIds.length > 0
      ? input.rewardServiceIds
      : null
  if (rewardServiceIds) await assertRewardServicesBelong(establishmentId, rewardServiceIds)

  const values = {
    establishmentId,
    active: input.active,
    stampsRequired: input.stampsRequired,
    minTicketCents: input.minTicketCents,
    rewardType: input.rewardType,
    rewardValue: input.rewardType === 'free_service' ? 0 : input.rewardValue,
    rewardServiceIds,
  }
  const [program] = await db
    .insert(loyaltyPrograms)
    .values(values)
    .onConflictDoUpdate({ target: loyaltyPrograms.establishmentId, set: values })
    .returning()
  return program
}

/** Resumo de fidelidade do cliente (progresso do cartão) */
export async function getClientLoyalty(establishmentId: string, clientId: string) {
  const program = await getProgram(establishmentId)
  const availableStamps = await countAvailableStamps(db, establishmentId, clientId)
  return {
    program,
    availableStamps,
    canRedeem: Boolean(program?.active) && program != null && availableStamps >= program.stampsRequired,
  }
}

/**
 * Resgata a recompensa do cartão: consome os carimbos mais antigos e cunha um
 * cupom pessoal de uso único com a regra vigente do programa.
 */
export async function redeemLoyalty(establishmentId: string, input: RedeemLoyaltyInput) {
  const client = await db.query.clients.findFirst({
    where: and(eq(clients.id, input.clientId), eq(clients.establishmentId, establishmentId)),
    columns: { id: true },
  })
  if (!client) throw new AppError('Cliente não encontrado', 404)

  return db.transaction(async (tx) => {
    // Serializa resgates do mesmo cliente: a checagem de disponíveis é
    // check-then-insert.
    await lockClientLoyalty(tx, input.clientId)

    const program = await tx.query.loyaltyPrograms.findFirst({
      where: eq(loyaltyPrograms.establishmentId, establishmentId),
    })
    if (!program?.active) throw new AppError('O cartão fidelidade não está ativo', 400)

    const available = await tx
      .select({ id: loyaltyStamps.id })
      .from(loyaltyStamps)
      .where(
        and(
          eq(loyaltyStamps.establishmentId, establishmentId),
          eq(loyaltyStamps.clientId, input.clientId),
          isNull(loyaltyStamps.redemptionId),
        ),
      )
      .orderBy(asc(loyaltyStamps.createdAt))
    if (available.length < program.stampsRequired) {
      throw new AppError('O cliente ainda não tem carimbos suficientes', 400)
    }

    const coupon = await mintPersonalCoupon(tx, {
      establishmentId,
      clientId: input.clientId,
      source: 'loyalty',
      name: 'Recompensa do cartão fidelidade',
      discountType: program.rewardType,
      discountValue: program.rewardValue,
      appliesToServiceIds:
        program.rewardType === 'free_service' && program.rewardServiceIds?.length
          ? program.rewardServiceIds
          : null,
    })

    const [redemption] = await tx
      .insert(loyaltyRedemptions)
      .values({
        establishmentId,
        clientId: input.clientId,
        stampsSpent: program.stampsRequired,
        couponId: coupon.id,
        rewardType: program.rewardType,
        rewardValue: program.rewardValue,
        rewardServiceIds: program.rewardServiceIds ?? null,
      })
      .returning()

    // Consome os carimbos mais antigos
    const consumedIds = available.slice(0, program.stampsRequired).map((s) => s.id)
    await tx
      .update(loyaltyStamps)
      .set({ redemptionId: redemption.id })
      .where(inArray(loyaltyStamps.id, consumedIds))

    return { redemption, coupon }
  })
}

/**
 * Sincroniza o carimbo do atendimento dentro da transação de updateAppointment
 * (mesmo padrão da comissão: delete incondicional, insert só se concluído).
 * Chamar com lockClientLoyalty já adquirido.
 */
export async function syncLoyaltyStamp(
  tx: DbTransaction,
  params: {
    establishmentId: string
    appointmentId: string
    clientId: string
    completed: boolean
    finalCents: number
  },
) {
  const stamp = await tx.query.loyaltyStamps.findFirst({
    where: eq(loyaltyStamps.appointmentId, params.appointmentId),
  })

  if (stamp?.redemptionId) {
    if (!params.completed) {
      throw new AppError(
        'Não é possível reabrir: o carimbo deste atendimento já foi usado em um resgate',
        409,
      )
    }
    // Refinalização com carimbo já consumido: preserva o histórico do resgate
    return
  }

  if (stamp) await tx.delete(loyaltyStamps).where(eq(loyaltyStamps.id, stamp.id))
  if (!params.completed) return

  const program = await tx.query.loyaltyPrograms.findFirst({
    where: eq(loyaltyPrograms.establishmentId, params.establishmentId),
  })
  if (!program?.active) return
  if (params.finalCents < program.minTicketCents) return

  // Cartão cheio: para de carimbar ao atingir o limite e nunca passa dele. Só
  // volta a acumular depois que o cliente resgata (o resgate consome os
  // carimbos e zera os disponíveis). Serializado pelo lockClientLoyalty do
  // chamador, então a contagem não corre com outro fechamento do mesmo cliente.
  const available = await countAvailableStamps(tx, params.establishmentId, params.clientId)
  if (available >= program.stampsRequired) return

  await tx.insert(loyaltyStamps).values({
    establishmentId: params.establishmentId,
    clientId: params.clientId,
    appointmentId: params.appointmentId,
  })
}
