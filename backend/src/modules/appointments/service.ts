import { and, asc, desc, eq, gte, ilike, inArray, like, lte, ne, or, sql } from 'drizzle-orm'
import { db } from '../../db'
import {
  appointments,
  clients,
  commissionEntries,
  couponRedemptions,
  employeeCommissions,
  employees,
  products,
  services,
  transactions,
} from '../../db/schema'
import { addMinutesToTime } from '../../lib/datetime'
import { lockClientLoyalty, lockEmployeeDay } from '../../lib/locks'
import { isValidPhone, normalizePhone, timesOverlap } from '../../lib/slots'
import { AppError } from '../../lib/errors'
import { resolveCouponForCheckout } from '../coupons/service'
import { syncLoyaltyStamp } from '../loyalty/service'
import { syncPointsEntry } from '../points/service'
import type {
  CreateAppointmentInput,
  ListAppointmentsQuery,
  RecentAppointmentsQuery,
  SearchAppointmentsQuery,
  UpdateAppointmentInput,
} from './schemas'

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

const joinedWith = {
  client: { columns: { id: true, name: true, phone: true } },
  service: { columns: { id: true, name: true, durationMinutes: true, priceCents: true } },
  employee: { columns: { id: true, name: true } },
} as const

type Payment = {
  method: 'cash' | 'pix' | 'debit' | 'credit'
  installments: number | null
  amountCents: number
}

type SaleProduct = { productId: string; name: string; quantity: number; unitPriceCents: number }
type SaleService = { serviceId: string; name: string; quantity: number; unitPriceCents: number }

interface JoinedRow {
  id: string
  date: string
  startTime: string
  endTime: string
  status: 'confirmed' | 'cancelled' | 'completed' | 'pending'
  createdVia: 'panel' | 'public'
  notes: string | null
  discountCents: number
  payments: Payment[] | null
  saleProducts: SaleProduct[] | null
  saleServices: SaleService[] | null
  debtCents: number
  tipCents: number
  createdAt: Date
  client: { id: string; name: string; phone: string }
  service: { id: string; name: string; durationMinutes: number; priceCents: number }
  employee: { id: string; name: string }
}

function toJoinedAppointment(row: JoinedRow) {
  return {
    id: row.id,
    date: row.date,
    startTime: row.startTime,
    endTime: row.endTime,
    status: row.status,
    createdVia: row.createdVia,
    notes: row.notes,
    discountCents: row.discountCents,
    payments: row.payments,
    saleProducts: row.saleProducts,
    saleServices: row.saleServices,
    debtCents: row.debtCents,
    tipCents: row.tipCents,
    createdAt: row.createdAt,
    client: row.client,
    service: row.service,
    employee: row.employee,
  }
}

/** Monta o snapshot (nome/preço atuais) dos produtos vendidos */
async function buildSaleSnapshot(
  establishmentId: string,
  items: { productId: string; quantity: number }[],
): Promise<SaleProduct[]> {
  if (items.length === 0) return []
  const ids = items.map((i) => i.productId)
  const rows = await db
    .select({ id: products.id, name: products.name, priceCents: products.priceCents })
    .from(products)
    .where(and(eq(products.establishmentId, establishmentId), inArray(products.id, ids)))
  const byId = new Map(rows.map((p) => [p.id, p]))
  return items.map((item) => {
    const product = byId.get(item.productId)
    if (!product) throw new AppError('Produto não encontrado', 404)
    return {
      productId: product.id,
      name: product.name,
      quantity: item.quantity,
      unitPriceCents: product.priceCents,
    }
  })
}

/** Monta o snapshot (nome/preço atuais) dos serviços extras realizados junto */
async function buildSaleServicesSnapshot(
  establishmentId: string,
  items: { serviceId: string; quantity: number }[],
): Promise<SaleService[]> {
  if (items.length === 0) return []
  const ids = items.map((i) => i.serviceId)
  const rows = await db
    .select({ id: services.id, name: services.name, priceCents: services.priceCents })
    .from(services)
    .where(and(eq(services.establishmentId, establishmentId), inArray(services.id, ids)))
  const byId = new Map(rows.map((s) => [s.id, s]))
  return items.map((item) => {
    const service = byId.get(item.serviceId)
    if (!service) throw new AppError('Serviço não encontrado', 404)
    return {
      serviceId: service.id,
      name: service.name,
      quantity: item.quantity,
      unitPriceCents: service.priceCents,
    }
  })
}

type ComputedCommission = {
  baseCents: number
  commissionType: string
  commissionValue: number
  commissionCents: number
}

/**
 * Calcula a comissão do profissional pelo serviço executado. Base = preço do
 * serviço (mesma lógica da prévia exibida no cadastro do profissional; não
 * considera desconto nem produtos). Retorna null quando o profissional está
 * sem comissão habilitada ou não há regra cadastrada para o serviço.
 */
async function computeCommission(
  tx: DbTransaction,
  employeeId: string,
  service: { id: string; priceCents: number },
): Promise<ComputedCommission | null> {
  const employee = await tx.query.employees.findFirst({
    where: eq(employees.id, employeeId),
    columns: { commissionEnabled: true, commissionType: true },
  })
  if (!employee?.commissionEnabled) return null

  const rule = await tx.query.employeeCommissions.findFirst({
    where: and(
      eq(employeeCommissions.employeeId, employeeId),
      eq(employeeCommissions.serviceId, service.id),
    ),
  })
  if (!rule || rule.value <= 0) return null

  const baseCents = service.priceCents
  const commissionCents =
    employee.commissionType === 'percent'
      ? Math.round((baseCents * rule.value) / 100)
      : rule.value

  return {
    baseCents,
    commissionType: employee.commissionType,
    commissionValue: rule.value,
    commissionCents,
  }
}

// Exportada para reuso pelo módulo de fila de espera (promoção → agendamento).
export async function assertNoConflict(
  tx: DbTransaction,
  params: {
    establishmentId: string
    employeeId: string
    date: string
    startTime: string
    endTime: string
    excludeId?: string
  },
) {
  const conditions = [
    eq(appointments.establishmentId, params.establishmentId),
    eq(appointments.employeeId, params.employeeId),
    eq(appointments.date, params.date),
    ne(appointments.status, 'cancelled'),
  ]
  if (params.excludeId) conditions.push(ne(appointments.id, params.excludeId))

  // Serializa reservas do mesmo profissional+dia: sem o lock, duas transações
  // concorrentes passam pela checagem antes de qualquer commit e gravam
  // agendamentos sobrepostos.
  await lockEmployeeDay(tx, params.employeeId, params.date)

  const existing = await tx
    .select({ startTime: appointments.startTime, endTime: appointments.endTime })
    .from(appointments)
    .where(and(...conditions))

  const hasConflict = existing.some((a) =>
    timesOverlap(params.startTime, params.endTime, a.startTime, a.endTime),
  )
  if (hasConflict) throw new AppError('Já existe um agendamento neste horário', 409)
}

export async function listAppointments(establishmentId: string, query: ListAppointmentsQuery) {
  const conditions = [
    eq(appointments.establishmentId, establishmentId),
    gte(appointments.date, query.start),
    lte(appointments.date, query.end),
  ]
  if (query.employeeId) conditions.push(eq(appointments.employeeId, query.employeeId))
  if (query.status) conditions.push(eq(appointments.status, query.status))

  const rows = await db.query.appointments.findMany({
    where: and(...conditions),
    with: joinedWith,
    orderBy: [asc(appointments.date), asc(appointments.startTime)],
  })
  return rows.map(toJoinedAppointment)
}

/**
 * Agendamentos criados recentemente (por createdAt, não pela data do
 * atendimento). Alimenta a notificação de "novo agendamento" no painel —
 * inclui reservas do link público e do próprio painel. Ignora cancelados.
 */
export async function listRecentAppointments(
  establishmentId: string,
  query: RecentAppointmentsQuery,
) {
  const since = new Date(Date.now() - query.sinceHours * 3_600_000)
  const rows = await db.query.appointments.findMany({
    where: and(
      eq(appointments.establishmentId, establishmentId),
      gte(appointments.createdAt, since),
      ne(appointments.status, 'cancelled'),
    ),
    with: joinedWith,
    orderBy: [desc(appointments.createdAt)],
    limit: 30,
  })
  return rows.map(toJoinedAppointment)
}

export async function searchAppointments(establishmentId: string, query: SearchAppointmentsQuery) {
  const term = query.q.trim()
  const digits = normalizePhone(term)

  const clientConditions = [ilike(clients.name, `%${term}%`)]
  if (digits.length >= 3) clientConditions.push(like(clients.phone, `%${digits}%`))

  const matchingClients = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.establishmentId, establishmentId), or(...clientConditions)))

  if (matchingClients.length === 0) return []

  const rows = await db.query.appointments.findMany({
    where: and(
      eq(appointments.establishmentId, establishmentId),
      inArray(
        appointments.clientId,
        matchingClients.map((c) => c.id),
      ),
    ),
    with: joinedWith,
    orderBy: [desc(appointments.date), desc(appointments.startTime)],
    limit: 25,
  })
  return rows.map(toJoinedAppointment)
}

export async function getAppointment(establishmentId: string, id: string) {
  const row = await db.query.appointments.findFirst({
    where: and(eq(appointments.id, id), eq(appointments.establishmentId, establishmentId)),
    with: joinedWith,
  })
  if (!row) throw new AppError('Agendamento não encontrado', 404)
  return toJoinedAppointment(row)
}

export async function createAppointment(establishmentId: string, input: CreateAppointmentInput) {
  const service = await db.query.services.findFirst({
    where: and(eq(services.id, input.serviceId), eq(services.establishmentId, establishmentId)),
  })
  if (!service) throw new AppError('Serviço não encontrado', 404)

  const employee = await db.query.employees.findFirst({
    where: and(eq(employees.id, input.employeeId), eq(employees.establishmentId, establishmentId)),
  })
  if (!employee) throw new AppError('Profissional não encontrado', 404)

  const endTime = addMinutesToTime(input.startTime, service.durationMinutes)

  // O painel pode registrar atendimentos em horários passados (walk-in),
  // então não bloqueamos datas/horários anteriores ao momento atual.
  const created = await db.transaction(async (tx) => {
    // Revalida o conflito dentro da transação: outro agendamento pode ter
    // sido criado para o mesmo horário entre a checagem e a confirmação.
    await assertNoConflict(tx, {
      establishmentId,
      employeeId: employee.id,
      date: input.date,
      startTime: input.startTime,
      endTime,
    })

    let clientId: string
    if (input.clientId) {
      const client = await tx.query.clients.findFirst({
        where: and(eq(clients.id, input.clientId), eq(clients.establishmentId, establishmentId)),
      })
      if (!client) throw new AppError('Cliente não encontrado', 404)
      clientId = client.id
    } else {
      if (!input.clientName || !input.clientPhone) {
        throw new AppError('Informe o nome e telefone do cliente', 400)
      }
      if (!isValidPhone(input.clientPhone)) throw new AppError('Telefone inválido', 400)
      const phone = normalizePhone(input.clientPhone)

      let client = await tx.query.clients.findFirst({
        where: and(eq(clients.establishmentId, establishmentId), eq(clients.phone, phone)),
      })
      if (!client) {
        // onConflictDoNothing: criação concorrente do mesmo telefone não pode
        // estourar o índice único com erro 500.
        const [newClient] = await tx
          .insert(clients)
          .values({ establishmentId, name: input.clientName.trim(), phone })
          .onConflictDoNothing()
          .returning()
        client =
          newClient ??
          (await tx.query.clients.findFirst({
            where: and(eq(clients.establishmentId, establishmentId), eq(clients.phone, phone)),
          }))
      }
      if (!client) throw new AppError('Não foi possível registrar o cliente', 500)
      clientId = client.id
    }

    const [appointment] = await tx
      .insert(appointments)
      .values({
        establishmentId,
        clientId,
        serviceId: service.id,
        employeeId: employee.id,
        date: input.date,
        startTime: input.startTime,
        endTime,
        status: 'confirmed',
        createdVia: 'panel',
        notes: input.notes,
      })
      .returning()

    return appointment
  })

  return getAppointment(establishmentId, created.id)
}

export async function updateAppointment(
  establishmentId: string,
  id: string,
  input: UpdateAppointmentInput,
) {
  const appointment = await db.query.appointments.findFirst({
    where: and(eq(appointments.id, id), eq(appointments.establishmentId, establishmentId)),
    with: {
      service: { columns: { name: true, durationMinutes: true, priceCents: true } },
      client: { columns: { name: true } },
    },
  })
  if (!appointment) throw new AppError('Agendamento não encontrado', 404)

  if (input.employeeId && input.employeeId !== appointment.employeeId) {
    const employee = await db.query.employees.findFirst({
      where: and(
        eq(employees.id, input.employeeId),
        eq(employees.establishmentId, establishmentId),
      ),
    })
    if (!employee) throw new AppError('Profissional não encontrado', 404)
  }

  const newDate = input.date ?? appointment.date
  const newStartTime = input.startTime ?? appointment.startTime
  const newEmployeeId = input.employeeId ?? appointment.employeeId
  const newStatus = input.status ?? appointment.status

  // Fechamento do serviço: só faz sentido em atendimentos concluídos. Ao
  // reabrir/cancelar, zeramos desconto e formas de pagamento.
  const priceCents = appointment.service.priceCents
  let discountToStore = appointment.discountCents
  let paymentsToStore: Payment[] | null = appointment.payments
  let saleProductsToStore: SaleProduct[] | null = appointment.saleProducts
  let saleServicesToStore: SaleService[] | null = appointment.saleServices
  if (newStatus === 'completed') {
    if (input.discountCents !== undefined) discountToStore = input.discountCents
    if (input.payments !== undefined)
      paymentsToStore = input.payments.map((p) => ({
        method: p.method,
        installments: p.installments ?? null,
        amountCents: p.amountCents,
      }))
    if (input.saleProducts !== undefined)
      saleProductsToStore = await buildSaleSnapshot(establishmentId, input.saleProducts)
    if (input.saleServices !== undefined)
      saleServicesToStore = await buildSaleServicesSnapshot(establishmentId, input.saleServices)
  } else {
    discountToStore = 0
    paymentsToStore = null
    saleProductsToStore = null
    saleServicesToStore = null
  }
  const productsCents = (saleProductsToStore ?? []).reduce(
    (acc, p) => acc + p.quantity * p.unitPriceCents,
    0,
  )
  const extraServicesCents = (saleServicesToStore ?? []).reduce(
    (acc, s) => acc + s.quantity * s.unitPriceCents,
    0,
  )
  const subtotalCents = priceCents + productsCents + extraServicesCents
  // A validação de desconto/pagamentos acontece dentro da transação: o cupom
  // (código digitado ou campanha automática) é resolvido lá e redefine o
  // desconto antes do cálculo do total final.

  const rescheduled =
    newDate !== appointment.date ||
    newStartTime !== appointment.startTime ||
    newEmployeeId !== appointment.employeeId
  // Reativar um cancelado também precisa de checagem: o horário pode ter sido
  // reservado por outro cliente enquanto estava livre.
  const reactivated = appointment.status === 'cancelled' && newStatus !== 'cancelled'
  const newEndTime = rescheduled
    ? addMinutesToTime(newStartTime, appointment.service.durationMinutes)
    : appointment.endTime

  await db.transaction(async (tx) => {
    if (rescheduled || reactivated) {
      await assertNoConflict(tx, {
        establishmentId,
        employeeId: newEmployeeId,
        date: newDate,
        startTime: newStartTime,
        endTime: newEndTime,
        excludeId: id,
      })
    }

    // Cupom: estorna o resgate anterior e (re)aplica no fechamento. Quando um
    // cupom vale, ele é a fonte da verdade do desconto; sem cupom, vale o
    // desconto manual digitado. Remarcar um atendimento que segue concluído
    // sem reenviar o fechamento não mexe no resgate existente. lockCoupon é
    // adquirido dentro do resolve, sempre depois do lockEmployeeDay acima.
    const reclosing =
      input.couponCode !== undefined ||
      input.discountCents !== undefined ||
      input.payments !== undefined ||
      input.saleProducts !== undefined ||
      input.saleServices !== undefined
    const shouldResolveCoupon =
      newStatus === 'completed' && (appointment.status !== 'completed' || reclosing)
    if (newStatus !== 'completed' || shouldResolveCoupon) {
      await tx.delete(couponRedemptions).where(eq(couponRedemptions.appointmentId, id))
    }
    let appliedCoupon: Awaited<ReturnType<typeof resolveCouponForCheckout>> = null
    if (shouldResolveCoupon) {
      appliedCoupon = await resolveCouponForCheckout(tx, {
        establishmentId,
        clientId: appointment.clientId,
        serviceId: appointment.serviceId,
        servicePriceCents: priceCents,
        subtotalCents,
        date: newDate,
        excludeAppointmentId: id,
        couponCode: input.couponCode,
        manualDiscountCents: discountToStore,
      })
      if (appliedCoupon) discountToStore = appliedCoupon.discountCents
    }

    if (discountToStore > subtotalCents) {
      throw new AppError('O desconto não pode ser maior que o total', 400)
    }
    const finalCents = Math.max(0, subtotalCents - discountToStore)
    // Valor efetivamente recebido no fechamento. Pode diferir do total quando o
    // cliente deixa gorjeta (paga a mais) ou fica devendo (paga a menos) — nesse
    // caso a receita reflete o dinheiro que de fato entrou, não o valor nominal.
    const collectedCents =
      newStatus === 'completed' && paymentsToStore && paymentsToStore.length > 0
        ? paymentsToStore.reduce((acc, p) => acc + p.amountCents, 0)
        : finalCents

    // Dívida/gorjeta do cliente. debtCents é o efeito líquido (com sinal) no
    // saldo devedor: > 0 passou a dever mais, < 0 quitou parte. Quando o
    // fechamento inclui a dívida anterior (settlePreviousDebt), ela entra no
    // valor devido e é abatida pelo que foi pago. tipCents é o valor pago acima
    // do total devido. Reabrir/cancelar zera ambos (o pagamento também é zerado).
    let debtCentsToStore = 0
    let tipCentsToStore = 0
    if (newStatus === 'completed') {
      const [prevRow] = await tx
        .select({ balance: sql<string>`coalesce(sum(${appointments.debtCents}), 0)` })
        .from(appointments)
        .where(
          and(
            eq(appointments.establishmentId, establishmentId),
            eq(appointments.clientId, appointment.clientId),
            eq(appointments.status, 'completed'),
            ne(appointments.id, id),
          ),
        )
      const prevBalance = Number(prevRow?.balance ?? 0)
      const settling = Boolean(input.settlePreviousDebt) && prevBalance > 0
      const dueCents = finalCents + (settling ? prevBalance : 0)
      tipCentsToStore = Math.max(0, collectedCents - dueCents)
      if (settling) {
        const newBalance = Math.max(0, dueCents - collectedCents)
        debtCentsToStore = newBalance - prevBalance
      } else {
        debtCentsToStore = Math.max(0, finalCents - collectedCents)
      }
    }

    const [updated] = await tx
      .update(appointments)
      .set({
        status: newStatus,
        date: newDate,
        startTime: newStartTime,
        endTime: newEndTime,
        employeeId: newEmployeeId,
        discountCents: discountToStore,
        payments: paymentsToStore,
        saleProducts: saleProductsToStore,
        saleServices: saleServicesToStore,
        debtCents: debtCentsToStore,
        tipCents: tipCentsToStore,
      })
      .where(and(eq(appointments.id, id), eq(appointments.establishmentId, establishmentId)))
      .returning()
    if (!updated) throw new AppError('Agendamento não encontrado', 404)

    if (appliedCoupon) {
      await tx.insert(couponRedemptions).values({
        establishmentId,
        couponId: appliedCoupon.couponId,
        clientId: appointment.clientId,
        appointmentId: id,
        discountCents: appliedCoupon.discountCents,
      })
    }

    // Ajuste de estoque: repõe os produtos do estado anterior (se estava
    // concluído) e baixa os do novo fechamento. Cobre finalizar, reabrir e
    // refinalizar com produtos diferentes.
    const stockDelta = new Map<string, number>()
    if (appointment.status === 'completed') {
      for (const p of appointment.saleProducts ?? [])
        stockDelta.set(p.productId, (stockDelta.get(p.productId) ?? 0) + p.quantity)
    }
    if (newStatus === 'completed') {
      for (const p of saleProductsToStore ?? [])
        stockDelta.set(p.productId, (stockDelta.get(p.productId) ?? 0) - p.quantity)
    }
    for (const [productId, change] of stockDelta) {
      if (change === 0) continue
      const product = await tx.query.products.findFirst({
        where: and(eq(products.id, productId), eq(products.establishmentId, establishmentId)),
      })
      if (!product) continue // produto removido do catálogo — ignora
      const newStock = product.stockQuantity + change
      if (newStock < 0) {
        throw new AppError(`Estoque insuficiente de "${product.name}"`, 400)
      }
      await tx.update(products).set({ stockQuantity: newStock }).where(eq(products.id, productId))
    }

    // Sincronização financeira: agendamento concluído gera uma receita
    // vinculada; desfazer a conclusão remove a receita (estorno).
    if (newStatus === 'completed') {
      const existingIncome = await tx.query.transactions.findFirst({
        where: and(eq(transactions.appointmentId, id), eq(transactions.type, 'income')),
      })
      if (existingIncome) {
        // Remarcação move a receita; mudança de desconto/valor recebido ajusta o total
        if (existingIncome.date !== updated.date || existingIncome.amountCents !== collectedCents) {
          await tx
            .update(transactions)
            .set({ date: updated.date, amountCents: collectedCents })
            .where(eq(transactions.id, existingIncome.id))
        }
      } else {
        await tx.insert(transactions).values({
          establishmentId,
          appointmentId: id,
          description: `Serviço: ${appointment.service.name} — ${appointment.client.name}`,
          amountCents: collectedCents,
          type: 'income',
          date: updated.date,
        })
      }
    } else {
      await tx
        .delete(transactions)
        .where(
          and(
            eq(transactions.appointmentId, id),
            eq(transactions.establishmentId, establishmentId),
          ),
        )
    }

    // Sincronização da comissão: atendimento concluído gera (ou recalcula) a
    // comissão do profissional pelo serviço; reabrir/cancelar remove a
    // apuração. Recalcular via delete+insert cobre troca de profissional,
    // remarcação (nova data) e mudança da regra desde a última conclusão.
    await tx.delete(commissionEntries).where(eq(commissionEntries.appointmentId, id))
    if (newStatus === 'completed') {
      const commission = await computeCommission(tx, newEmployeeId, {
        id: appointment.serviceId,
        priceCents: appointment.service.priceCents,
      })
      if (commission) {
        await tx.insert(commissionEntries).values({
          establishmentId,
          appointmentId: id,
          employeeId: newEmployeeId,
          serviceId: appointment.serviceId,
          date: updated.date,
          baseCents: commission.baseCents,
          commissionType: commission.commissionType,
          commissionValue: commission.commissionValue,
          commissionCents: commission.commissionCents,
        })
      }
    }

    // Fidelidade e pontos: acumulam sobre o valor realmente pago (finalCents),
    // mesmo padrão da comissão (delete incondicional + insert se concluído).
    // O lock serializa contra resgates concorrentes do mesmo cliente.
    await lockClientLoyalty(tx, appointment.clientId)
    const accrualParams = {
      establishmentId,
      appointmentId: id,
      clientId: appointment.clientId,
      completed: newStatus === 'completed',
      finalCents,
    }
    await syncLoyaltyStamp(tx, accrualParams)
    await syncPointsEntry(tx, accrualParams)
  })

  return getAppointment(establishmentId, id)
}
