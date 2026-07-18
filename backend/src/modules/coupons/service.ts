import { randomBytes } from 'node:crypto'
import { and, count, desc, eq, inArray, ne } from 'drizzle-orm'
import { db } from '../../db'
import { appointments, couponRedemptions, coupons, services } from '../../db/schema'
import { todayStr } from '../../lib/datetime'
import { AppError } from '../../lib/errors'
import { lockCoupon } from '../../lib/locks'
import { assertFeature } from '../../lib/plan'
import type {
  CreateCouponInput,
  ListCouponsQuery,
  UpdateCouponInput,
  ValidateCouponInput,
} from './schemas'

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
// As funções de validação rodam tanto no preview (db) quanto no fechamento (tx)
type DbClient = typeof db | DbTransaction

type CouponRow = typeof coupons.$inferSelect

function isUniqueViolation(err: unknown): boolean {
  const error = err as { code?: string; cause?: { code?: string } }
  return error.code === '23505' || error.cause?.code === '23505'
}

/** Contexto do fechamento contra o qual um cupom é validado */
export interface CheckoutCouponContext {
  establishmentId: string
  clientId: string
  serviceId: string
  servicePriceCents: number
  subtotalCents: number
  /** data do atendimento (não a de hoje: honra walk-in retroativo) */
  date: string
  /** exclui o próprio atendimento das contagens (refinalizar/preview) */
  excludeAppointmentId?: string
}

export interface AppliedCoupon {
  couponId: string
  code: string | null
  name: string | null
  source: CouponRow['source']
  discountType: CouponRow['discountType']
  discountValue: number
  discountCents: number
}

/** Calcula o desconto de um cupom já validado (sempre inteiro, em centavos) */
export function computeCouponDiscountCents(
  coupon: Pick<
    CouponRow,
    'discountType' | 'discountValue' | 'appliesTo' | 'maxDiscountCents'
  >,
  ctx: Pick<CheckoutCouponContext, 'servicePriceCents' | 'subtotalCents'>,
): number {
  // 'free_service' desconta o preço do serviço (nunca produtos)
  const base =
    coupon.appliesTo === 'service' || coupon.discountType === 'free_service'
      ? ctx.servicePriceCents
      : ctx.subtotalCents
  let discount: number
  if (coupon.discountType === 'percent') {
    discount = Math.round((base * coupon.discountValue) / 100)
  } else if (coupon.discountType === 'fixed') {
    discount = coupon.discountValue
  } else {
    discount = base
  }
  if (coupon.maxDiscountCents != null) discount = Math.min(discount, coupon.maxDiscountCents)
  return Math.max(0, Math.min(discount, base, ctx.subtotalCents))
}

/**
 * Valida um cupom contra o contexto do fechamento. Lança AppError com o motivo
 * quando não vale; retorna o desconto calculado quando vale.
 */
export async function validateCouponAgainstContext(
  client: DbClient,
  coupon: CouponRow,
  ctx: CheckoutCouponContext,
): Promise<number> {
  if (coupon.establishmentId !== ctx.establishmentId) {
    throw new AppError('Cupom não encontrado', 404)
  }
  if (!coupon.active) throw new AppError('Cupom inativo', 400)
  if (coupon.clientId && coupon.clientId !== ctx.clientId) {
    throw new AppError('Este cupom pertence a outro cliente', 400)
  }
  // Datas comparadas como string 'YYYY-MM-DD' contra a data do atendimento
  if (coupon.validFrom && ctx.date < coupon.validFrom) {
    throw new AppError('Cupom ainda não está válido', 400)
  }
  if (coupon.validUntil && ctx.date > coupon.validUntil) {
    throw new AppError('Cupom expirado', 400)
  }
  if (ctx.subtotalCents < coupon.minSpendCents) {
    throw new AppError('O valor do atendimento não atinge o mínimo deste cupom', 400)
  }
  if (
    coupon.appliesToServiceIds &&
    coupon.appliesToServiceIds.length > 0 &&
    !coupon.appliesToServiceIds.includes(ctx.serviceId)
  ) {
    throw new AppError('Este cupom não vale para este serviço', 400)
  }

  if (coupon.firstVisitOnly) {
    const conditions = [
      eq(appointments.establishmentId, ctx.establishmentId),
      eq(appointments.clientId, ctx.clientId),
      eq(appointments.status, 'completed'),
    ]
    if (ctx.excludeAppointmentId) conditions.push(ne(appointments.id, ctx.excludeAppointmentId))
    const [row] = await client.select({ value: count() }).from(appointments).where(and(...conditions))
    if (Number(row?.value ?? 0) > 0) {
      throw new AppError('Este cupom vale apenas para a primeira visita do cliente', 400)
    }
  }

  if (coupon.maxUses != null || coupon.usesPerClient > 0) {
    const baseConditions = [eq(couponRedemptions.couponId, coupon.id)]
    if (ctx.excludeAppointmentId) {
      baseConditions.push(ne(couponRedemptions.appointmentId, ctx.excludeAppointmentId))
    }
    if (coupon.maxUses != null) {
      const [row] = await client
        .select({ value: count() })
        .from(couponRedemptions)
        .where(and(...baseConditions))
      if (Number(row?.value ?? 0) >= coupon.maxUses) {
        throw new AppError('Cupom esgotado', 400)
      }
    }
    const [clientRow] = await client
      .select({ value: count() })
      .from(couponRedemptions)
      .where(and(...baseConditions, eq(couponRedemptions.clientId, ctx.clientId)))
    if (Number(clientRow?.value ?? 0) >= coupon.usesPerClient) {
      throw new AppError('Este cliente já usou este cupom', 400)
    }
  }

  const discountCents = computeCouponDiscountCents(coupon, ctx)
  if (discountCents <= 0) throw new AppError('Este cupom não gera desconto neste atendimento', 400)
  return discountCents
}

function toAppliedCoupon(coupon: CouponRow, discountCents: number): AppliedCoupon {
  return {
    couponId: coupon.id,
    code: coupon.code,
    name: coupon.name,
    source: coupon.source,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    discountCents,
  }
}

/**
 * Varre as campanhas autoApply ativas e devolve a de maior desconto que casa
 * com o contexto. `lock=true` (fechamento) adquire lockCoupon e revalida sob o
 * lock antes de escolher; preview roda sem lock.
 */
export async function findBestAutoApplyCoupon(
  client: DbClient,
  ctx: CheckoutCouponContext,
  options: { lock: boolean },
): Promise<AppliedCoupon | null> {
  const candidates = await client.query.coupons.findMany({
    where: and(
      eq(coupons.establishmentId, ctx.establishmentId),
      eq(coupons.active, true),
      eq(coupons.autoApply, true),
      eq(coupons.source, 'campaign'),
    ),
  })

  const valid: { coupon: CouponRow; discountCents: number }[] = []
  for (const candidate of candidates) {
    try {
      valid.push({
        coupon: candidate,
        discountCents: await validateCouponAgainstContext(client, candidate, ctx),
      })
    } catch (err) {
      if (err instanceof AppError) continue // campanha não casa — segue
      throw err
    }
  }
  valid.sort((a, b) => b.discountCents - a.discountCents)

  for (const { coupon, discountCents } of valid) {
    if (!options.lock) return toAppliedCoupon(coupon, discountCents)
    await lockCoupon(client as DbTransaction, coupon.id)
    try {
      // Revalida sob o lock: o limite de usos pode ter sido consumido em paralelo
      const revalidated = await validateCouponAgainstContext(client, coupon, ctx)
      return toAppliedCoupon(coupon, revalidated)
    } catch (err) {
      if (err instanceof AppError) continue
      throw err
    }
  }
  return null
}

/**
 * Resolve o cupom do fechamento dentro da transação de updateAppointment.
 * Código digitado vence (erro é propagado); sem código e sem desconto manual,
 * aplica a melhor campanha autoApply. Retorna null quando nenhum cupom vale.
 */
export async function resolveCouponForCheckout(
  tx: DbTransaction,
  params: CheckoutCouponContext & { couponCode?: string; manualDiscountCents: number },
): Promise<AppliedCoupon | null> {
  const { couponCode, manualDiscountCents, ...ctx } = params
  if (couponCode) {
    const code = couponCode.trim().toUpperCase()
    const coupon = await tx.query.coupons.findFirst({
      where: and(eq(coupons.establishmentId, ctx.establishmentId), eq(coupons.code, code)),
    })
    if (!coupon) throw new AppError('Cupom não encontrado', 404)
    // Serializa o resgate: a recontagem de usos é check-then-insert.
    // Adquirido depois de lockEmployeeDay (quando houve remarcação) — manter a ordem.
    await lockCoupon(tx, coupon.id)
    const discountCents = await validateCouponAgainstContext(tx, coupon, ctx)
    return toAppliedCoupon(coupon, discountCents)
  }
  // Desconto manual digitado vence a campanha automática (comportamento
  // previsível: o dono vê exatamente o desconto que digitou)
  if (manualDiscountCents > 0) return null
  return findBestAutoApplyCoupon(tx, ctx, { lock: true })
}

// ---------------------------------------------------------------------------
// Cunhagem de cupom pessoal (recompensa de fidelidade / resgate de pontos)
// ---------------------------------------------------------------------------

// Sem 0/O/1/I/L para o código ser fácil de ditar no balcão
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function randomCode(prefix: string): string {
  const bytes = randomBytes(6)
  let suffix = ''
  for (const byte of bytes) suffix += CODE_ALPHABET[byte % CODE_ALPHABET.length]
  return `${prefix}-${suffix}`
}

export interface MintCouponParams {
  establishmentId: string
  clientId: string
  source: 'loyalty' | 'points'
  name: string
  discountType: CouponRow['discountType']
  discountValue: number
  /** free_service restrito a um serviço: [serviceId]; null = qualquer */
  appliesToServiceIds: string[] | null
  maxDiscountCents?: number | null
}

/**
 * Cunha o cupom pessoal de uso único que materializa uma recompensa. O código
 * gerado (FID-/PTS-) entra no mesmo caminho de validação dos cupons manuais.
 */
export async function mintPersonalCoupon(
  tx: DbTransaction,
  params: MintCouponParams,
): Promise<CouponRow> {
  const prefix = params.source === 'loyalty' ? 'FID' : 'PTS'
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [coupon] = await tx
        .insert(coupons)
        .values({
          establishmentId: params.establishmentId,
          clientId: params.clientId,
          source: params.source,
          name: params.name,
          code: randomCode(prefix),
          discountType: params.discountType,
          discountValue: params.discountValue,
          appliesTo: params.discountType === 'free_service' ? 'service' : 'total',
          appliesToServiceIds: params.appliesToServiceIds,
          maxDiscountCents: params.maxDiscountCents ?? null,
          maxUses: 1,
          usesPerClient: 1,
          autoApply: false,
          active: true,
        })
        .returning()
      return coupon
    } catch (err) {
      if (isUniqueViolation(err)) continue // colisão de código — gera outro
      throw err
    }
  }
  throw new AppError('Não foi possível gerar o código do cupom', 500)
}

// ---------------------------------------------------------------------------
// CRUD (painel) e preview de validação (checkout)
// ---------------------------------------------------------------------------

/** Regras cruzadas validadas sobre o resultado final (create e update merged) */
function assertCouponRuleValid(values: {
  discountType: CouponRow['discountType']
  discountValue: number
  validFrom: string | null
  validUntil: string | null
}) {
  if (values.discountType === 'percent') {
    if (values.discountValue < 1 || values.discountValue > 100) {
      throw new AppError('A porcentagem deve estar entre 1 e 100', 400)
    }
  }
  if (values.discountType === 'fixed' && values.discountValue < 1) {
    throw new AppError('Informe o valor do desconto', 400)
  }
  if (values.validFrom && values.validUntil && values.validFrom > values.validUntil) {
    throw new AppError('A validade final deve ser depois da inicial', 400)
  }
}

async function assertServicesBelong(establishmentId: string, serviceIds: string[]) {
  if (serviceIds.length === 0) return
  const rows = await db
    .select({ id: services.id })
    .from(services)
    .where(and(eq(services.establishmentId, establishmentId), inArray(services.id, serviceIds)))
  if (rows.length !== new Set(serviceIds).size) {
    throw new AppError('Selecione serviços válidos', 400)
  }
}

async function redemptionCounts(establishmentId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ couponId: couponRedemptions.couponId, value: count() })
    .from(couponRedemptions)
    .where(eq(couponRedemptions.establishmentId, establishmentId))
    .groupBy(couponRedemptions.couponId)
  return new Map(rows.map((r) => [r.couponId, Number(r.value)]))
}

export async function listCoupons(establishmentId: string, query: ListCouponsQuery) {
  const conditions = [eq(coupons.establishmentId, establishmentId)]
  if (query.source) conditions.push(eq(coupons.source, query.source))
  // Sem filtro: só manual+campaign (cupons cunhados aparecem no cliente)
  else conditions.push(inArray(coupons.source, ['manual', 'campaign']))

  const rows = await db.query.coupons.findMany({
    where: and(...conditions),
    orderBy: [desc(coupons.createdAt)],
  })
  const counts = await redemptionCounts(establishmentId)
  return rows.map((row) => ({ ...row, redemptionsCount: counts.get(row.id) ?? 0 }))
}

/** Cupons pessoais disponíveis do cliente (não esgotados nem expirados) */
export async function listClientCoupons(establishmentId: string, clientId: string) {
  const rows = await db.query.coupons.findMany({
    where: and(
      eq(coupons.establishmentId, establishmentId),
      eq(coupons.clientId, clientId),
      eq(coupons.active, true),
    ),
    orderBy: [desc(coupons.createdAt)],
  })
  if (rows.length === 0) return []
  const counts = await redemptionCounts(establishmentId)
  const today = todayStr()
  return rows
    .map((row) => ({ ...row, redemptionsCount: counts.get(row.id) ?? 0 }))
    .filter(
      (row) =>
        (row.maxUses == null || row.redemptionsCount < row.maxUses) &&
        (row.validUntil == null || row.validUntil >= today),
    )
}

export async function createCoupon(establishmentId: string, input: CreateCouponInput) {
  await assertFeature(establishmentId, 'cupons')

  const isCampaign = input.source === 'campaign'
  const isFreeService = input.discountType === 'free_service'
  const values = {
    name: input.name?.trim() || null,
    code: isCampaign ? null : (input.code ?? null),
    source: input.source,
    discountType: input.discountType,
    discountValue: isFreeService ? 0 : input.discountValue,
    appliesTo: isFreeService ? ('service' as const) : input.appliesTo,
    appliesToServiceIds:
      input.appliesToServiceIds && input.appliesToServiceIds.length > 0
        ? input.appliesToServiceIds
        : null,
    minSpendCents: input.minSpendCents,
    maxDiscountCents: input.maxDiscountCents ?? null,
    validFrom: input.validFrom ?? null,
    validUntil: input.validUntil ?? null,
    maxUses: input.maxUses ?? null,
    usesPerClient: input.usesPerClient,
    firstVisitOnly: input.firstVisitOnly,
    autoApply: isCampaign,
    active: input.active,
  }
  assertCouponRuleValid(values)
  await assertServicesBelong(establishmentId, values.appliesToServiceIds ?? [])

  try {
    const [coupon] = await db
      .insert(coupons)
      .values({ establishmentId, ...values })
      .returning()
    return { ...coupon, redemptionsCount: 0 }
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError('Já existe um cupom com este código', 409)
    }
    throw err
  }
}

export async function updateCoupon(
  establishmentId: string,
  id: string,
  input: UpdateCouponInput,
) {
  await assertFeature(establishmentId, 'cupons')

  const existing = await db.query.coupons.findFirst({
    where: and(eq(coupons.id, id), eq(coupons.establishmentId, establishmentId)),
  })
  if (!existing) throw new AppError('Cupom não encontrado', 404)
  if (existing.source === 'loyalty' || existing.source === 'points') {
    throw new AppError('Cupons de recompensa não podem ser editados', 400)
  }

  const patch: Partial<typeof coupons.$inferInsert> = {}
  if (input.name !== undefined) patch.name = input.name.trim() || null
  // Campanha não tem código; cupom manual pode trocar o dele
  if (input.code !== undefined && existing.source === 'manual') patch.code = input.code
  if (input.discountType !== undefined) patch.discountType = input.discountType
  if (input.discountValue !== undefined) patch.discountValue = input.discountValue
  if (input.appliesTo !== undefined) patch.appliesTo = input.appliesTo
  if (input.appliesToServiceIds !== undefined) {
    patch.appliesToServiceIds =
      input.appliesToServiceIds.length > 0 ? input.appliesToServiceIds : null
  }
  if (input.minSpendCents !== undefined) patch.minSpendCents = input.minSpendCents
  if (input.maxDiscountCents !== undefined) patch.maxDiscountCents = input.maxDiscountCents
  if (input.validFrom !== undefined) patch.validFrom = input.validFrom
  if (input.validUntil !== undefined) patch.validUntil = input.validUntil
  if (input.maxUses !== undefined) patch.maxUses = input.maxUses
  if (input.usesPerClient !== undefined) patch.usesPerClient = input.usesPerClient
  if (input.firstVisitOnly !== undefined) patch.firstVisitOnly = input.firstVisitOnly
  if (input.active !== undefined) patch.active = input.active

  const merged = { ...existing, ...patch }
  if (merged.discountType === 'free_service') {
    patch.discountValue = 0
    patch.appliesTo = 'service'
    merged.discountValue = 0
  }
  assertCouponRuleValid(merged)
  await assertServicesBelong(establishmentId, merged.appliesToServiceIds ?? [])

  try {
    const [updated] = await db
      .update(coupons)
      .set(patch)
      .where(and(eq(coupons.id, id), eq(coupons.establishmentId, establishmentId)))
      .returning()
    if (!updated) throw new AppError('Cupom não encontrado', 404)
    const counts = await redemptionCounts(establishmentId)
    return { ...updated, redemptionsCount: counts.get(updated.id) ?? 0 }
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError('Já existe um cupom com este código', 409)
    }
    throw err
  }
}

export async function deleteCoupon(establishmentId: string, id: string) {
  const existing = await db.query.coupons.findFirst({
    where: and(eq(coupons.id, id), eq(coupons.establishmentId, establishmentId)),
  })
  if (!existing) throw new AppError('Cupom não encontrado', 404)

  const [row] = await db
    .select({ value: count() })
    .from(couponRedemptions)
    .where(eq(couponRedemptions.couponId, id))
  const hasRedemptions = Number(row?.value ?? 0) > 0

  // Com histórico de resgates o delete é bloqueado pelo FK restrict —
  // desativa (soft delete) preservando o ledger.
  if (hasRedemptions) {
    await db
      .update(coupons)
      .set({ active: false })
      .where(and(eq(coupons.id, id), eq(coupons.establishmentId, establishmentId)))
    return
  }
  await db
    .delete(coupons)
    .where(and(eq(coupons.id, id), eq(coupons.establishmentId, establishmentId)))
}

/** Preview do checkout: valida código digitado ou busca a melhor campanha */
export async function validateCouponForCheckout(
  establishmentId: string,
  input: ValidateCouponInput,
) {
  const service = await db.query.services.findFirst({
    where: and(eq(services.id, input.serviceId), eq(services.establishmentId, establishmentId)),
    columns: { id: true, priceCents: true },
  })
  if (!service) throw new AppError('Serviço não encontrado', 404)

  const ctx: CheckoutCouponContext = {
    establishmentId,
    clientId: input.clientId,
    serviceId: input.serviceId,
    servicePriceCents: service.priceCents,
    subtotalCents: input.subtotalCents,
    date: input.date,
    excludeAppointmentId: input.appointmentId,
  }

  if (input.code) {
    const coupon = await db.query.coupons.findFirst({
      where: and(eq(coupons.establishmentId, establishmentId), eq(coupons.code, input.code)),
    })
    if (!coupon) throw new AppError('Cupom não encontrado', 404)
    const discountCents = await validateCouponAgainstContext(db, coupon, ctx)
    return { coupon: toAppliedCoupon(coupon, discountCents), discountCents }
  }

  const best = await findBestAutoApplyCoupon(db, ctx, { lock: false })
  return { coupon: best, discountCents: best?.discountCents ?? 0 }
}
